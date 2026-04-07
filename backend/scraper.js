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
    resources,
  };
  tenantCache.set(slug, info);
  return info;
}

async function getAvailability(tenantId, date) {
  const url = `${API_BASE}/availability?sport_id=PADEL&tenant_id=${tenantId}&start_min=${date}T00:00:00&start_max=${date}T23:59:59`;
  return fetchJson(url);
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
            const time = slot.start_time?.substring(0, 5);
            if (!time) continue;
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

    // Send one Telegram message per club with all dates
    if (hasChanges) {
      const courtsByDate = {};
      for (const dateStr of datesToCheck) {
        courtsByDate[dateStr] = db.getCourtsForClubAndDates(tenant.name, [dateStr]);
      }
      const changes = { newSlots, goneSlots };
      try {
        const errors = await notifier.notifyClubSummary(tenant.name, courtsByDate, clubUrl, changes);
        if (errors.length > 0) {
          emit('log', { level: 'warn', message: `Notificacion: ${errors.join(', ')}` });
        } else {
          emit('log', { level: 'info', message: `Telegram actualizado: ${tenant.name}` });
        }
      } catch (err) {
        emit('log', { level: 'error', message: `Error notificando: ${err.message}` });
      }
    }

    emit('log', {
      level: 'info',
      message: `${tenant.name}: ${totalNew} nueva(s), ${totalGone} ya no disponible(s).`,
    });

    return { changes: hasChanges };
  } catch (err) {
    emit('log', { level: 'error', message: `Error consultando ${slug}: ${err.message}` });
    return { changes: false };
  }
}

async function runScrape(emit) {
  const cfg = config.load();

  emit('log', { level: 'info', message: 'Iniciando comprobacion...' });
  emit('scrape_start', { timestamp: new Date().toISOString() });

  for (const clubUrl of (cfg.clubs || [])) {
    try {
      await scrapeClub(clubUrl, cfg, emit);
    } catch (err) {
      emit('log', { level: 'error', message: `Error en ${clubUrl}: ${err.message}` });
    }
  }

  emit('log', { level: 'info', message: 'Comprobacion finalizada.' });
  emit('scrape_end', {
    timestamp: new Date().toISOString(),
    totalCourts: db.getCourtCount(),
  });
}

module.exports = { runScrape };
