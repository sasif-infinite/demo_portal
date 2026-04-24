from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import json
import subprocess
import httpx
import docker as docker_sdk
from pathlib import Path

app = FastAPI(title="Demo Portal API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

APPS_FILE = Path(__file__).parent / "apps.json"
NGROK_AGENT = "http://host.docker.internal:4040/api"


def load_apps() -> list[dict]:
    return json.loads(APPS_FILE.read_text())


def get_app_def(app_id: str) -> dict:
    app_def = next((a for a in load_apps() if a["id"] == app_id), None)
    if not app_def:
        raise HTTPException(status_code=404, detail=f"App '{app_id}' not found")
    return app_def


def check_docker_status(app_id: str) -> str:
    try:
        client = docker_sdk.from_env()
        containers = client.containers.list(
            filters={"label": f"com.docker.compose.project={app_id}"}
        )
        return "running" if containers else "stopped"
    except Exception:
        return "unknown"


def check_tunnel(tunnel_name: str) -> dict:
    try:
        resp = httpx.get(f"{NGROK_AGENT}/tunnels", timeout=3)
        if resp.status_code == 200:
            for tunnel in resp.json().get("tunnels", []):
                if tunnel.get("name") == tunnel_name:
                    return {"active": True, "url": tunnel.get("public_url")}
    except Exception:
        pass
    return {"active": False, "url": None}


def build_response(app_def: dict) -> dict:
    tunnel = check_tunnel(app_def["tunnel_name"])
    return {
        **app_def,
        "docker_status": check_docker_status(app_def["id"]),
        "tunnel_active": tunnel["active"],
        "tunnel_url": tunnel["url"],
    }


@app.get("/apps")
async def list_apps():
    return [build_response(a) for a in load_apps()]


@app.get("/apps/{app_id}/status")
async def get_status(app_id: str):
    return build_response(get_app_def(app_id))


@app.post("/apps/{app_id}/start")
async def start_app(app_id: str):
    app_def = get_app_def(app_id)

    result = subprocess.run(
        ["docker", "compose", "-f", app_def["compose_file"], "up", "-d"],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=result.stderr.strip())

    tunnel_config = {
        "name": app_def["tunnel_name"],
        "proto": "http",
        "addr": str(app_def["port"]),
    }
    if app_def.get("subdomain"):
        tunnel_config["subdomain"] = app_def["subdomain"]

    try:
        httpx.post(f"{NGROK_AGENT}/tunnels", json=tunnel_config, timeout=10)
    except Exception:
        pass  # docker is up; surface tunnel state via status poll

    return build_response(app_def)


@app.post("/apps/{app_id}/stop")
async def stop_app(app_id: str):
    app_def = get_app_def(app_id)

    try:
        httpx.delete(f"{NGROK_AGENT}/tunnels/{app_def['tunnel_name']}", timeout=5)
    except Exception:
        pass

    result = subprocess.run(
        ["docker", "compose", "-f", app_def["compose_file"], "down"],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=result.stderr.strip())

    return build_response(app_def)
