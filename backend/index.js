const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const db = require('./db');
const scraper = require('./scraper');
const notifier = require('./notifier');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

app.use(cors());
app.use(express.json());

// Basic auth
const AUTH_USER = process.env.AUTH_USER || 'admin';
const AUTH_PASS = process.env.AUTH_PASS || 'admin';

function basicAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Playtomic Scraper"');
    return res.status(401).send('Autenticacion requerida');
  }
  const [user, pass] = Buffer.from(auth.split(' ')[1], 'base64').toString().split(':');
  if (user === AUTH_USER && pass === AUTH_PASS) return next();
  res.set('WWW-Authenticate', 'Basic realm="Playtomic Scraper"');
  return res.status(401).send('Credenciales incorrectas');
}

app.use(basicAuth);

// Serve frontend build in production
app.use(express.static(path.join(__dirname, '..', 'frontend', 'dist')));

// --- State ---
let schedulerTimer = null;
let isRunning = false;
let lastCheck = null;
let nextCheck = null;
let sessionFound = 0;

function log(level, message) {
  const timestamp = new Date().toISOString();
  db.addLog(level, message);
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
  io.emit('log', { timestamp, level, message });
}

function emit(event, data) {
  if (event === 'log') {
    log(data.level, data.message);
  } else {
    io.emit(event, data);
    if (event === 'court_found') sessionFound++;
  }
}

// --- Scheduler ---

async function runOnce() {
  if (isRunning) {
    log('warn', 'Ya hay una comprobacion en curso, saltando...');
    return;
  }

  isRunning = true;
  io.emit('status', getStatus());

  try {
    await scraper.runScrape(emit);
  } catch (err) {
    log('error', `Error critico en scraping: ${err.message}`);
    await notifier.sendAlertTelegram(`\u26a0\ufe0f Error critico en el scraper:\n${err.message}`);
  } finally {
    isRunning = false;
    lastCheck = new Date().toISOString();
    scheduleNext();
    io.emit('status', getStatus());
  }
}

function scheduleNext() {
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }

  const cfg = config.load();
  if (!cfg.scraperActive) {
    nextCheck = null;
    return;
  }

  const intervalMs = (cfg.intervalSeconds || 30) * 1000;
  nextCheck = new Date(Date.now() + intervalMs).toISOString();

  schedulerTimer = setTimeout(() => {
    runOnce();
  }, intervalMs);
}

async function startScheduler() {
  config.set('scraperActive', true);
  log('info', 'Scraper iniciado');
  sessionFound = 0;
  try {
    await notifier.sendFiltersMessage(config.load());
  } catch (err) {
    log('warn', `Error enviando filtros: ${err.message}`);
  }
  runOnce();
}

async function stopScheduler() {
  config.set('scraperActive', false);
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }
  nextCheck = null;
  log('info', 'Scraper detenido');
  io.emit('status', getStatus());
  await notifier.sendAlertTelegram('\u26d4 Scraper detenido');
}

function getStatus() {
  return {
    active: config.get('scraperActive'),
    isRunning,
    lastCheck,
    nextCheck,
    sessionFound,
    totalCourts: db.getCourtCount(),
  };
}

// --- API Routes ---

// Status
app.get('/api/status', (req, res) => {
  res.json(getStatus());
});

// Start/stop scraper
app.post('/api/scraper/start', async (req, res) => {
  await startScheduler();
  res.json({ ok: true });
});

app.post('/api/scraper/stop', (req, res) => {
  stopScheduler();
  res.json({ ok: true });
});

// Run once manually
app.post('/api/scraper/run', async (req, res) => {
  if (isRunning) {
    return res.status(409).json({ error: 'Ya hay una comprobacion en curso' });
  }
  runOnce();
  res.json({ ok: true });
});

// Config
app.get('/api/config', (req, res) => {
  res.json(config.load());
});

app.post('/api/config', async (req, res) => {
  config.save(req.body);
  // Delete all Telegram messages first
  try {
    await notifier.deleteAllTelegramMessages();
  } catch (err) {
    log('warn', `Error borrando mensajes: ${err.message}`);
  }
  // Send new filters message
  try {
    await notifier.sendFiltersMessage(config.load());
  } catch (err) {
    log('warn', `Error enviando filtros: ${err.message}`);
  }
  sessionFound = 0;
  log('info', 'Configuracion actualizada - datos limpiados');
  res.json({ ok: true });
  runOnce();
});

// Courts
app.get('/api/courts', (req, res) => {
  const filters = {
    club: req.query.club || null,
    date: req.query.date || null,
  };
  res.json(db.getAllCourts(filters));
});

app.delete('/api/courts', (req, res) => {
  db.clearCourts();
  db.clearLogs();
  sessionFound = 0;
  lastCheck = null;
  nextCheck = null;
  log('info', 'Todo limpiado');
  res.json({ ok: true });
});

// Logs
app.get('/api/logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  res.json(db.getLogs(limit));
});

// Clear Telegram messages
app.post('/api/telegram/clear', async (req, res) => {
  try {
    await notifier.deleteAllTelegramMessages();
    log('info', 'Mensajes de Telegram borrados');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Test notifications
app.post('/api/notifications/test', async (req, res) => {
  try {
    const errors = await notifier.sendTestNotification();
    if (errors.length > 0) {
      res.json({ ok: false, errors });
    } else {
      res.json({ ok: true });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Catch-all for SPA routing in production
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, '..', 'frontend', 'dist', 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) res.status(404).send('Not found');
  });
});

// --- Socket.io ---

io.use((socket, next) => {
  const auth = socket.handshake.auth?.token || socket.handshake.headers?.authorization;
  if (auth) {
    const decoded = Buffer.from(auth.replace('Basic ', ''), 'base64').toString();
    const [user, pass] = decoded.split(':');
    if (user === AUTH_USER && pass === AUTH_PASS) return next();
  }
  return next(new Error('Autenticacion requerida'));
});

io.on('connection', (socket) => {
  socket.emit('status', getStatus());

  // Send recent logs on connect
  const recentLogs = db.getLogs(50);
  for (const entry of recentLogs.reverse()) {
    socket.emit('log', entry);
  }
});

// --- Start ---

const PORT = process.env.PORT || 3001;

(async () => {
  await db.init();

  server.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
    log('info', 'Servidor iniciado');

    // Auto-resume if scheduler was active
    if (config.get('scraperActive')) {
      log('info', 'Reanudando scraper (estaba activo al cerrar)');
      startScheduler();
    }

    // Self-ping to keep alive on Render free tier (every 14 min)
    if (process.env.RENDER_EXTERNAL_URL) {
      setInterval(() => {
        fetch(`${process.env.RENDER_EXTERNAL_URL}/api/status`).catch(() => {});
      }, 14 * 60 * 1000);
    }

    // Poll Telegram for incoming messages every 3 seconds
    setInterval(() => {
      notifier.pollTelegramMessages(() => {
        const allCourts = db.getAllCourts({});
        if (allCourts.length === 0) return [];
        // Group by club, then by date
        const byClub = {};
        for (const c of allCourts) {
          if (!byClub[c.club]) byClub[c.club] = {};
          if (!byClub[c.club][c.date]) byClub[c.club][c.date] = [];
          byClub[c.club][c.date].push(c);
        }
        const messages = [];
        for (const [club, byDate] of Object.entries(byClub)) {
          messages.push(notifier.formatClubSummary(club, byDate, '', null));
        }
        return messages;
      });
    }, 3000);
  });
})();

// Graceful shutdown
process.on('SIGINT', async () => {
  await notifier.sendAlertTelegram('\u26a0\ufe0f Servidor apagandose...');
  server.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await notifier.sendAlertTelegram('\u26a0\ufe0f Servidor apagandose...');
  server.close();
  process.exit(0);
});
