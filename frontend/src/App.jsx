import { useState, useEffect, useCallback } from 'react';

const POLL_INTERVAL = 15_000;

function Badge({ label, color }) {
  const styles = {
    green: 'bg-green-100 text-green-700',
    gray: 'bg-gray-100 text-gray-500',
    blue: 'bg-blue-100 text-blue-700',
    red: 'bg-red-100 text-red-600',
  };
  const dots = {
    green: 'bg-green-500',
    gray: 'bg-gray-400',
    blue: 'bg-blue-500',
    red: 'bg-red-500',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[color]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dots[color]}`} />
      {label}
    </span>
  );
}

function AppCard({ app, loading, error, onStart, onStop }) {
  const isRunning = app.docker_status === 'running';

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 flex flex-col gap-4 hover:shadow-md transition-shadow">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">{app.name}</h2>
        <p className="text-sm text-gray-500 leading-relaxed">{app.description}</p>
      </div>

      {/* Status badges */}
      <div className="flex flex-wrap gap-2">
        <Badge
          label={isRunning ? 'Running' : 'Stopped'}
          color={isRunning ? 'green' : 'gray'}
        />
        <Badge
          label={app.tunnel_active ? 'Tunnel Online' : 'Tunnel Offline'}
          color={app.tunnel_active ? 'blue' : 'red'}
        />
      </div>

      {/* Live URL */}
      {app.tunnel_url ? (
        <a
          href={app.tunnel_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-blue-600 hover:text-blue-800 hover:underline truncate"
        >
          {app.tunnel_url}
        </a>
      ) : (
        <span className="text-sm text-gray-300 italic">No tunnel URL</span>
      )}

      {/* Error message */}
      {error && (
        <pre className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 whitespace-pre-wrap break-words">
          {error}
        </pre>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-auto pt-2">
        <button
          onClick={onStart}
          disabled={isRunning || loading}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            isRunning || loading
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-gray-900 text-white hover:bg-gray-700 cursor-pointer'
          }`}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              Working…
            </span>
          ) : 'Start'}
        </button>
        <button
          onClick={onStop}
          disabled={!isRunning || loading}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            !isRunning || loading
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-red-600 text-white hover:bg-red-500 cursor-pointer'
          }`}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              Working…
            </span>
          ) : 'Stop'}
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [apps, setApps] = useState([]);
  const [loadingIds, setLoadingIds] = useState({});
  const [cardErrors, setCardErrors] = useState({});
  const [fetchError, setFetchError] = useState(null);
  const [lastChecked, setLastChecked] = useState(null);

  const fetchApps = useCallback(async () => {
    try {
      const res = await fetch('/api/apps');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setApps(await res.json());
      setLastChecked(new Date());
      setFetchError(null);
    } catch (err) {
      setFetchError(err.message);
    }
  }, []);

  useEffect(() => {
    fetchApps();
    const id = setInterval(fetchApps, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchApps]);

  const handleAction = useCallback(async (appId, action) => {
    setLoadingIds(prev => ({ ...prev, [appId]: true }));
    setCardErrors(prev => ({ ...prev, [appId]: null }));
    try {
      const res = await fetch(`/api/apps/${appId}/${action}`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = typeof body.detail === 'string'
          ? body.detail
          : JSON.stringify(body.detail, null, 2);
        setCardErrors(prev => ({ ...prev, [appId]: msg }));
      }
    } catch (err) {
      setCardErrors(prev => ({ ...prev, [appId]: err.message }));
    } finally {
      await fetchApps();
      setLoadingIds(prev => ({ ...prev, [appId]: false }));
    }
  }, [fetchApps]);

  const runningCount = apps.filter(a => a.docker_status === 'running').length;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Demo Portal</h1>
          <p className="mt-1 text-sm text-gray-500">
            {runningCount} of {apps.length} app{apps.length !== 1 ? 's' : ''} running
            {lastChecked && (
              <span className="ml-2 text-gray-400">
                — last checked {lastChecked.toLocaleTimeString()}
              </span>
            )}
          </p>
          {fetchError && (
            <p className="mt-2 text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2 inline-block">
              Failed to reach backend: {fetchError}
            </p>
          )}
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map(app => (
            <AppCard
              key={app.id}
              app={app}
              loading={!!loadingIds[app.id]}
              error={cardErrors[app.id] || null}
              onStart={() => handleAction(app.id, 'start')}
              onStop={() => handleAction(app.id, 'stop')}
            />
          ))}
        </div>

        <p className="mt-12 text-center text-xs text-gray-300">
          Refreshes every {POLL_INTERVAL / 1000}s
        </p>
      </div>
    </div>
  );
}
