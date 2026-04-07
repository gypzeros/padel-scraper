import React, { useEffect, useRef } from 'react';

const LEVEL_STYLES = {
  info: 'text-blue-600',
  success: 'text-emerald-600',
  warn: 'text-amber-600',
  error: 'text-red-600',
};

export default function LogViewer({ logs }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div
      ref={containerRef}
      className="bg-gray-900 rounded-lg p-4 h-80 overflow-y-auto font-mono text-xs"
    >
      {logs.length === 0 ? (
        <div className="text-gray-500">Sin actividad todavia...</div>
      ) : (
        logs.map((entry, i) => (
          <div key={i} className="leading-relaxed">
            <span className="text-gray-500">
              {entry.timestamp
                ? new Date(entry.timestamp).toLocaleTimeString('es-ES')
                : ''}
            </span>{' '}
            <span className={LEVEL_STYLES[entry.level] || 'text-gray-300'}>
              [{(entry.level || 'info').toUpperCase()}]
            </span>{' '}
            <span className="text-gray-200">{entry.message}</span>
          </div>
        ))
      )}
    </div>
  );
}
