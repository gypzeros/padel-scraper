import React from 'react';

export default function CourtCard({ court }) {
  return (
    <tr className="border-b hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3 text-sm">{court.club}</td>
      <td className="px-4 py-3 text-sm font-medium">{court.court_name}</td>
      <td className="px-4 py-3 text-sm">{court.date}</td>
      <td className="px-4 py-3 text-sm">{court.time}</td>
      <td className="px-4 py-3 text-sm text-gray-500">
        {court.created_at ? new Date(court.created_at).toLocaleString('es-ES') : '—'}
      </td>
      <td className="px-4 py-3 text-sm">
        <a
          href={court.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-emerald-600 hover:text-emerald-800 font-medium"
        >
          Reservar
        </a>
      </td>
    </tr>
  );
}
