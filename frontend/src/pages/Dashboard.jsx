import React from 'react';
import { apiFetch } from '../App';
import StatusIndicator from '../components/StatusIndicator';
import LogViewer from '../components/LogViewer';

const API = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';

export default function Dashboard({ status, logs }) {
  const handleStart = () => apiFetch(`${API}/api/scraper/start`, { method: 'POST' });
  const handleStop = () => apiFetch(`${API}/api/scraper/stop`, { method: 'POST' });
  const handleRunOnce = () => apiFetch(`${API}/api/scraper/run`, { method: 'POST' });

  const formatDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('es-ES');
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="text-sm text-gray-500 mb-1">Estado</div>
          <StatusIndicator active={status.active} running={status.isRunning} />
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="text-sm text-gray-500 mb-1">Ultima comprobacion</div>
          <div className="text-sm font-medium">{formatDate(status.lastCheck)}</div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="text-sm text-gray-500 mb-1">Proxima comprobacion</div>
          <div className="text-sm font-medium">{formatDate(status.nextCheck)}</div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="text-sm text-gray-500 mb-1">Pistas encontradas (sesion)</div>
          <div className="text-2xl font-bold text-emerald-600">{status.sessionFound}</div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Control del Scraper</h2>
          <div className="flex gap-2">
            {status.active ? (
              <button
                onClick={handleStop}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm font-medium"
              >
                Detener
              </button>
            ) : (
              <button
                onClick={handleStart}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium"
              >
                Iniciar
              </button>
            )}
            <button
              onClick={handleRunOnce}
              disabled={status.isRunning}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Ejecutar ahora
            </button>
          </div>
        </div>
        <div className="text-sm text-gray-500">
          Total pistas en base de datos: <span className="font-semibold text-gray-700">{status.totalCourts}</span>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border p-5">
        <h2 className="text-lg font-semibold mb-4">Logs en tiempo real</h2>
        <LogViewer logs={logs} />
      </div>
    </div>
  );
}
