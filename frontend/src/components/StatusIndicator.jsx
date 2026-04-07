import React from 'react';

export default function StatusIndicator({ active, running }) {
  if (running) {
    return (
      <div className="flex items-center gap-2">
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
        </span>
        <span className="text-sm font-medium text-amber-600">Comprobando...</span>
      </div>
    );
  }

  if (active) {
    return (
      <div className="flex items-center gap-2">
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
        </span>
        <span className="text-sm font-medium text-emerald-600">Activo</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex rounded-full h-3 w-3 bg-gray-400"></span>
      <span className="text-sm font-medium text-gray-500">Detenido</span>
    </div>
  );
}
