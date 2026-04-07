import React, { useEffect, useState } from 'react';
import { apiFetch } from '../App';
import CourtCard from '../components/CourtCard';

const API = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';

export default function Results() {
  const [courts, setCourts] = useState([]);
  const [filterClub, setFilterClub] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchCourts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterClub) params.set('club', filterClub);
      if (filterDate) params.set('date', filterDate);
      const res = await apiFetch(`${API}/api/courts?${params}`);
      const data = await res.json();
      setCourts(data);
    } catch (err) {
      console.error('Error fetching courts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCourts();
  }, [filterClub, filterDate]);

  const handleClear = async () => {
    if (!confirm('Seguro que quieres limpiar todo el historial?')) return;
    await apiFetch(`${API}/api/courts`, { method: 'DELETE' });
    setCourts([]);
  };

  const clubs = [...new Set(courts.map((c) => c.club))];

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border p-5">
        <div className="flex flex-wrap items-center gap-4">
          <h2 className="text-lg font-semibold mr-auto">Pistas encontradas</h2>

          <select
            value={filterClub}
            onChange={(e) => setFilterClub(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Todos los clubs</option>
            {clubs.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm"
          />

          <button
            onClick={handleClear}
            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm font-medium"
          >
            Limpiar historial
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-gray-500 py-12">Cargando...</div>
      ) : courts.length === 0 ? (
        <div className="text-center text-gray-400 py-12">
          No se han encontrado pistas todavia
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full bg-white rounded-xl shadow-sm border">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Club</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Pista</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Fecha</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Hora</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Detectado</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Enlace</th>
              </tr>
            </thead>
            <tbody>
              {courts.map((court) => (
                <CourtCard key={court.id} court={court} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
