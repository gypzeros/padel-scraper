const config = require('./config');
const db = require('./db');
const notifier = require('./notifier');

const API_BASE = 'https://api.playtomic.io/v1';

// Cache tenant info to avoid repeated lookups
const tenantCache = new Map();

function slugFromUrl(url) {
  const match = url.match(/\/clubs\/([^/?#]+)/);
  return match ? match[1] : null;
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

async function getTenant(slug) {
  if (tenantCache.has(slug)) return tenantCache.get(slug);

  // Try slug as-is, then without hyphens (some clubs use different formats)
  let tenant;
  for (const trySlug of [slug, slug.replace(/-/g, '')]) {
    const data = await fetchJson(`${API_BASE}/tenants?tenant_uid=${trySlug}`);
    const found = Array.isArray(data) ? data[0] : data;
    if (found && found.tenant_id) { tenant = found; break; }
  }
  if (!tenant) throw new Error(`Club no encontrado: ${slug}`);

  // Build resource map (resource_id -> court name)
  const resources = {};
  if (tenant.resources) {
    for (const r of tenant.resources) {
      resources[r.resource_id] = r.name || `Pista ${Object.keys(resources).length + 1}`;
    }
  }

  const info = {
    tenant_id: tenant.tenant_id,
    name: tenant.tenant_name || slug,
    timezone: tenant.address?.timezone || 'Europe/Madrid',
    resources,
  };
  tenantCache.set(slug, info);
  return info;
}

async function getAvailability(tenantId, date) {
  const url = `https://playtomic.com/api/clubs/availability?tenant_id=${tenantId}&date=${date}&sport_id=PADEL`;
  return fetchJson(url);
}

function utcToLocal(dateStr, timeUtc, timezone) {
  // Build a UTC date and convert to club timezone
  const utcDate = new Date(`${dateStr}T${timeUtc}Z`);
  const localStr = utcDate.toLocaleString('sv-SE', { timeZone: timezone });
  // "sv-SE" gives "YYYY-MM-DD HH:MM:SS" format
  const [localDate, localTime] = localStr.split(' ');
  return { date: localDate, time: localTime.substring(0, 5) };
}

function isTimeInRange(time, from, to) {
  return time >= from && time <= to;
}

function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isDayAllowed(dateStr, allowedDays) {
  const d = new Date(dateStr + 'T12:00:00');
  return allowedDays.includes(d.getDay());
}

function resolveDate(value) {
  if (!value || value === 'today') {
    return localDateStr(new Date());
  }
  const match = value.match(/^today\+(\d+)$/);
  if (match) {
    const d = new Date();
    d.setDate(d.getDate() + parseInt(match[1]));
    return localDateStr(d);
  }
  return value;
}

async function scrapeClub(clubUrl, cfg, emit) {
  const slug = slugFromUrl(clubUrl);
  if (!slug) {
    emit('log', { level: 'error', message: `URL invalida: ${clubUrl}` });
    return { changes: false };
  }

  try {
    emit('log', { level: 'info', message: `Consultando API para ${slug}...` });

    const tenant = await getTenant(slug);
    emit('log', { level: 'info', message: `Club: ${tenant.name} (${Object.keys(tenant.resources).length} pistas)` });

    const dateFrom = resolveDate(cfg.dateFrom);
    const dateTo = resolveDate(cfg.dateTo);

    const datesToCheck = [];
    const current = new Date(dateFrom + 'T12:00:00');
    const end = new Date(dateTo + 'T12:00:00');
    while (current <= end) {
      const dateStr = localDateStr(current);
      if (isDayAllowed(dateStr, cfg.days)) {
        datesToCheck.push(dateStr);
      }
      current.setDate(current.getDate() + 1);
    }

    emit('log', { level: 'info', message: `Comprobando ${datesToCheck.length} fecha(s): ${dateFrom} a ${dateTo}` });

    let totalNew = 0;
    let totalGone = 0;
    let hasChanges = false;
    const newSlots = [];
    const goneSlots = [];

    for (const dateStr of datesToCheck) {
      try {
        const availability = await getAvailability(tenant.tenant_id, dateStr);

        const currentSlots = new Set();
        const apiCourts = [];

        for (const resource of availability) {
          const courtName = tenant.resources[resource.resource_id] || 'Pista';

          for (const slot of (resource.slots || [])) {
            if (!slot.start_time) continue;

            // Convert UTC time from API to club local time
            const local = utcToLocal(dateStr, slot.start_time, tenant.timezone);
            const time = local.time;
            const localDate = local.date;

            // Skip if converted to a different date
            if (localDate !== dateStr) continue;

            if (!isTimeInRange(time, cfg.timeFrom, cfg.timeTo)) continue;

            const price = slot.price || '';
            const duration = slot.duration || 90;
            if (cfg.duration && duration !== cfg.duration) continue;
            const fullCourtName = `${courtName} (${duration}min${price ? ' - ' + price : ''})`;
            const courtUrl = `${clubUrl}?q=PADEL&date=${dateStr}`;

            currentSlots.add(`${fullCourtName}|${time}`);
            apiCourts.push({ club: tenant.name, court_name: fullCourtName, date: dateStr, time, url: courtUrl });
          }
        }

        for (const court of apiCourts) {
          if (db.insertCourt(court)) {
            totalNew++;
            hasChanges = true;
            newSlots.push({ date: dateStr, time: court.time });
            emit('court_found', court);
          }
        }

        const existingCourts = db.getCourtsForClubAndDates(tenant.name, [dateStr]);
        for (const court of existingCourts) {
          const key = `${court.court_name}|${court.time}`;
          if (!currentSlots.has(key)) {
            totalGone++;
            hasChanges = true;
            goneSlots.push({ date: dateStr, time: court.time });
            db.removeCourt(court.id);
          }
        }
      } catch (dateErr) {
        emit('log', { level: 'warn', message: `Error en ${dateStr}: ${dateErr.message}` });
      }
    }

    emit('log', {
      level: 'info',
      message: `${tenant.name}: ${totalNew} nueva(s), ${totalGone} ya no disponible(s).`,
    });

    return {
      changes: hasChanges,
      club: tenant.name,
      datesToCheck,
      newSlots,
      goneSlots,
    };
  } catch (err) {
    emit('log', { level: 'error', message: `Error consultando ${slug}: ${err.message}` });
    return { changes: false };
  }
}

async function runScrape(emit) {
  const cfg = config.load();

  // Clean up past dates
  db.removeCourtsBefore(localDateStr(new Date()));

  emit('log', { level: 'info', message: 'Iniciando comprobacion...' });
  emit('scrape_start', { timestamp: new Date().toISOString() });

  let anyChanges = false;
  const clubsData = [];

  for (const clubUrl of (cfg.clubs || [])) {
    try {
      const result = await scrapeClub(clubUrl, cfg, emit);
      if (result.changes) anyChanges = true;
      if (result.club) {
        const courtsByDate = {};
        for (const dateStr of result.datesToCheck) {
          courtsByDate[dateStr] = db.getCourtsForClubAndDates(result.club, [dateStr]);
        }
        clubsData.push({
          club: result.club,
          courtsByDate,
          changes: { newSlots: result.newSlots, goneSlots: result.goneSlots },
        });
      }
    } catch (err) {
      emit('log', { level: 'error', message: `Error en ${clubUrl}: ${err.message}` });
    }
  }

  // Send ONE single Telegram message with all clubs
  // Always send on first run (no message tracked yet) or when changes detected
  const isFirstRun = !db.getTelegramMessage('_main', '_main');
  if (anyChanges || isFirstRun) {
    try {
      const errors = await notifier.sendFullMessage(cfg, clubsData);
      if (errors.length > 0) {
        emit('log', { level: 'warn', message: `Notificacion: ${errors.join(', ')}` });
      } else {
        emit('log', { level: 'info', message: 'Telegram actualizado' });
      }
    } catch (err) {
      emit('log', { level: 'error', message: `Error notificando: ${err.message}` });
    }
  }

  emit('log', { level: 'info', message: 'Comprobacion finalizada.' });
  emit('scrape_end', {
    timestamp: new Date().toISOString(),
    totalCourts: db.getCourtCount(),
  });
}

module.exports = { runScrape };
