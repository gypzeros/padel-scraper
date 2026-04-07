import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { io } from 'socket.io-client';
import Dashboard from './pages/Dashboard';
import Results from './pages/Results';
import Config from './pages/Config';

// Auth helper
function getAuthHeader() {
  const creds = sessionStorage.getItem('auth');
  return creds ? `Basic ${creds}` : null;
}

export function apiFetch(url, options = {}) {
  const auth = getAuthHeader();
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      ...(auth ? { Authorization: auth } : {}),
    },
  });
}

export default function App() {
  const [authed, setAuthed] = useState(!!sessionStorage.getItem('auth'));
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [socket, setSocket] = useState(null);
  const [status, setStatus] = useState({
    active: false,
    isRunning: false,
    lastCheck: null,
    nextCheck: null,
    sessionFound: 0,
    totalCourts: 0,
  });
  const [logs, setLogs] = useState([]);

  const handleLogin = async (e) => {
    e.preventDefault();
    const creds = btoa(`${user}:${pass}`);
    try {
      const res = await fetch(
        (window.location.hostname === 'localhost' ? 'http://localhost:3001' : '') + '/api/status',
        { headers: { Authorization: `Basic ${creds}` } }
      );
      if (res.ok) {
        sessionStorage.setItem('auth', creds);
        setAuthed(true);
        setError('');
      } else {
        setError('Usuario o contrasena incorrectos');
      }
    } catch {
      setError('Error de conexion');
    }
  };

  useEffect(() => {
    if (!authed) return;

    const creds = sessionStorage.getItem('auth');
    const s = io(window.location.hostname === 'localhost' ? 'http://localhost:3001' : undefined, {
      auth: { token: creds },
    });
    setSocket(s);

    s.on('status', (st) => setStatus(st));
    s.on('log', (entry) => setLogs((prev) => [...prev.slice(-499), entry]));
    s.on('court_found', () => {
      setStatus((prev) => ({
        ...prev,
        sessionFound: prev.sessionFound + 1,
        totalCourts: prev.totalCourts + 1,
      }));
    });

    return () => s.disconnect();
  }, [authed]);

  if (!authed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <form onSubmit={handleLogin} className="bg-white rounded-xl shadow-sm border p-8 w-80 space-y-4">
          <h1 className="text-xl font-bold text-emerald-700 text-center">Playtomic Scraper</h1>
          <input
            type="text"
            placeholder="Usuario"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm w-full"
            autoFocus
          />
          <input
            type="password"
            placeholder="Contrasena"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm w-full"
          />
          {error && <div className="text-red-500 text-sm">{error}</div>}
          <button
            type="submit"
            className="w-full px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium"
          >
            Entrar
          </button>
        </form>
      </div>
    );
  }

  const linkClass = ({ isActive }) =>
    `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? 'bg-emerald-600 text-white'
        : 'text-gray-600 hover:bg-gray-200'
    }`;

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4">
            <h1 className="text-xl font-bold text-emerald-700 mr-6">
              Playtomic Scraper
            </h1>
            <NavLink to="/" className={linkClass} end>
              Dashboard
            </NavLink>
            <NavLink to="/results" className={linkClass}>
              Resultados
            </NavLink>
            <NavLink to="/config" className={linkClass}>
              Configuracion
            </NavLink>
            <button
              onClick={() => { sessionStorage.removeItem('auth'); setAuthed(false); }}
              className="ml-auto text-sm text-gray-500 hover:text-red-500"
            >
              Salir
            </button>
          </div>
        </nav>

        <main className="max-w-6xl mx-auto px-4 py-6">
          <Routes>
            <Route path="/" element={<Dashboard status={status} logs={logs} />} />
            <Route path="/results" element={<Results />} />
            <Route path="/config" element={<Config />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
