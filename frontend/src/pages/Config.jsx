import React, { useEffect, useState } from 'react';
import { apiFetch } from '../App';

const API = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';

const DAY_NAMES = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];
const DAY_VALUES = [1, 2, 3, 4, 5, 6, 0];

export default function ConfigPage() {
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [newClub, setNewClub] = useState('');

  useEffect(() => {
    apiFetch(`${API}/api/config`)
      .then((r) => r.json())
      .then(setCfg)
      .catch(console.error);
  }, []);

  if (!cfg) return <div className="text-center py-12 text-gray-500">Cargando configuracion...</div>;

  const update = (key, value) => setCfg((prev) => ({ ...prev, [key]: value }));

  const toggleDay = (day) => {
    const days = cfg.days || [];
    if (days.includes(day)) {
      update('days', days.filter((d) => d !== day));
    } else {
      update('days', [...days, day]);
    }
  };

  const addClub = () => {
    if (!newClub.trim()) return;
    update('clubs', [...(cfg.clubs || []), newClub.trim()]);
    setNewClub('');
  };

  const removeClub = (index) => {
    update('clubs', cfg.clubs.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch(`${API}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      });
      setTestResult({ ok: true, message: 'Configuracion guardada' });
    } catch (err) {
      setTestResult({ ok: false, message: err.message });
    } finally {
      setSaving(false);
      setTimeout(() => setTestResult(null), 3000);
    }
  };

  const handleTestNotifications = async () => {
    setTestResult(null);
    try {
      const res = await apiFetch(`${API}/api/notifications/test`, { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setTestResult({ ok: true, message: 'Notificacion de prueba enviada correctamente' });
      } else {
        setTestResult({ ok: false, message: (data.errors || [data.error]).join(', ') });
      }
    } catch (err) {
      setTestResult({ ok: false, message: err.message });
    }
  };

  const inputClass = 'border rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-emerald-500';
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1';

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Clubs */}
      <Section title="Clubs">
        <div className="space-y-2">
          {(cfg.clubs || []).map((url, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-sm flex-1 truncate bg-gray-50 px-3 py-2 rounded-lg border">{url}</span>
              <button
                onClick={() => removeClub(i)}
                className="text-red-500 hover:text-red-700 text-sm font-medium"
              >
                Eliminar
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <input
              type="text"
              value={newClub}
              onChange={(e) => setNewClub(e.target.value)}
              placeholder="https://playtomic.com/clubs/..."
              className={inputClass}
              onKeyDown={(e) => e.key === 'Enter' && addClub()}
            />
            <button
              onClick={addClub}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium whitespace-nowrap"
            >
              Anadir
            </button>
          </div>
        </div>
      </Section>

      {/* Search Range */}
      <Section title="Rango de busqueda">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Fecha inicio</label>
            <input
              type="text"
              value={cfg.dateFrom || ''}
              onChange={(e) => update('dateFrom', e.target.value)}
              placeholder="today o YYYY-MM-DD"
              className={inputClass}
            />
            <span className="text-xs text-gray-400 mt-1">today, today+3, o fecha fija (2026-04-15)</span>
          </div>
          <div>
            <label className={labelClass}>Fecha fin</label>
            <input
              type="text"
              value={cfg.dateTo || ''}
              onChange={(e) => update('dateTo', e.target.value)}
              placeholder="today+10 o YYYY-MM-DD"
              className={inputClass}
            />
            <span className="text-xs text-gray-400 mt-1">today, today+10, o fecha fija (2026-04-25)</span>
          </div>
          <div>
            <label className={labelClass}>Hora inicio</label>
            <input
              type="time"
              value={cfg.timeFrom || '08:00'}
              onChange={(e) => update('timeFrom', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Hora fin</label>
            <input
              type="time"
              value={cfg.timeTo || '22:00'}
              onChange={(e) => update('timeTo', e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div className="mt-4">
          <label className={labelClass}>Dias de la semana</label>
          <div className="flex gap-2">
            {DAY_VALUES.map((val, i) => (
              <button
                key={val}
                onClick={() => toggleDay(val)}
                className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  (cfg.days || []).includes(val)
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-100'
                }`}
              >
                {DAY_NAMES[i]}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <label className={labelClass}>Duracion de pista (minutos, 0 = cualquiera)</label>
          <input
            type="number"
            min="0"
            max="180"
            value={cfg.duration || 0}
            onChange={(e) => update('duration', parseInt(e.target.value) || 0)}
            className={inputClass + ' max-w-[200px]'}
          />
        </div>

        <div className="mt-4">
          <label className={labelClass}>Intervalo de comprobacion (segundos)</label>
          <input
            type="number"
            min="10"
            max="86400"
            value={cfg.intervalSeconds || 30}
            onChange={(e) => update('intervalSeconds', parseInt(e.target.value) || 30)}
            className={inputClass + ' max-w-[200px]'}
          />
        </div>
      </Section>

      {/* Email */}
      <Section title="Email (SMTP)">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Servidor SMTP</label>
            <input
              type="text"
              value={cfg.smtpHost || ''}
              onChange={(e) => update('smtpHost', e.target.value)}
              placeholder="smtp.gmail.com"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Puerto</label>
            <input
              type="number"
              value={cfg.smtpPort || 587}
              onChange={(e) => update('smtpPort', parseInt(e.target.value) || 587)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Usuario</label>
            <input
              type="text"
              value={cfg.smtpUser || ''}
              onChange={(e) => update('smtpUser', e.target.value)}
              placeholder="tu@email.com"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Contrasena</label>
            <input
              type="password"
              value={cfg.smtpPass || ''}
              onChange={(e) => update('smtpPass', e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="col-span-2">
            <label className={labelClass}>Destinatario</label>
            <input
              type="email"
              value={cfg.emailTo || ''}
              onChange={(e) => update('emailTo', e.target.value)}
              placeholder="destino@email.com"
              className={inputClass}
            />
          </div>
        </div>
      </Section>

      {/* Telegram */}
      <Section title="Telegram">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Bot Token</label>
            <input
              type="text"
              value={cfg.telegramBotToken || ''}
              onChange={(e) => update('telegramBotToken', e.target.value)}
              placeholder="123456:ABC-DEF..."
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Chat ID</label>
            <input
              type="text"
              value={cfg.telegramChatId || ''}
              onChange={(e) => update('telegramChatId', e.target.value)}
              placeholder="123456789"
              className={inputClass}
            />
          </div>
        </div>
      </Section>

      {/* Actions */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium disabled:opacity-50"
        >
          {saving ? 'Guardando...' : 'Guardar configuracion'}
        </button>
        <button
          onClick={handleTestNotifications}
          className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm font-medium"
        >
          Probar notificaciones
        </button>
        <button
          onClick={async () => {
            await apiFetch(`${API}/api/telegram/clear`, { method: 'POST' });
            setTestResult({ ok: true, message: 'Mensajes de Telegram borrados' });
            setTimeout(() => setTestResult(null), 3000);
          }}
          className="px-6 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm font-medium"
        >
          Borrar mensajes Telegram
        </button>
        {testResult && (
          <span className={`text-sm font-medium ${testResult.ok ? 'text-emerald-600' : 'text-red-600'}`}>
            {testResult.message}
          </span>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border p-5">
      <h3 className="text-lg font-semibold mb-4">{title}</h3>
      {children}
    </div>
  );
}
