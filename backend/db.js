const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data.db');
const MAX_LOGS = 500;

let db;
let initPromise;

function init() {
  if (!initPromise) {
    initPromise = (async () => {
      const SQL = await initSqlJs();
      let buffer = null;
      if (fs.existsSync(DB_PATH)) {
        buffer = fs.readFileSync(DB_PATH);
      }
      db = buffer ? new SQL.Database(buffer) : new SQL.Database();
      initialize();
    })();
  }
  return initPromise;
}

function save() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function initialize() {
  db.run(`
    CREATE TABLE IF NOT EXISTS found_courts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      club TEXT NOT NULL,
      court_name TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      url TEXT NOT NULL,
      notified_at TEXT,
      telegram_message_id INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  // Add column if upgrading from older schema
  try { db.run('ALTER TABLE found_courts ADD COLUMN telegram_message_id INTEGER'); } catch (e) {}
  db.run(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT DEFAULT (datetime('now')),
      level TEXT NOT NULL,
      message TEXT NOT NULL
    )
  `);
  db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_court_unique
      ON found_courts(club, court_name, date, time)
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS telegram_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      club TEXT NOT NULL,
      date TEXT NOT NULL,
      message_id INTEGER NOT NULL,
      UNIQUE(club, date)
    )
  `);
  save();
}

function getRows(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function getRow(sql, params = []) {
  const rows = getRows(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

function run(sql, params = []) {
  db.run(sql, params);
  const changes = db.getRowsModified();
  save();
  return changes;
}

// --- Config ---

function getConfig(key) {
  const row = getRow('SELECT value FROM config WHERE key = ?', [key]);
  return row ? JSON.parse(row.value) : null;
}

function setConfig(key, value) {
  run(
    'INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, JSON.stringify(value)]
  );
}

function getAllConfig() {
  const rows = getRows('SELECT key, value FROM config');
  const cfg = {};
  for (const row of rows) {
    cfg[row.key] = JSON.parse(row.value);
  }
  return cfg;
}

// --- Found Courts ---

function insertCourt(court) {
  const changes = run(
    'INSERT OR IGNORE INTO found_courts (club, court_name, date, time, url) VALUES (?, ?, ?, ?, ?)',
    [court.club, court.court_name, court.date, court.time, court.url]
  );
  return changes > 0;
}

function markNotified(id, telegramMessageId) {
  if (telegramMessageId) {
    run("UPDATE found_courts SET notified_at = datetime('now'), telegram_message_id = ? WHERE id = ?", [telegramMessageId, id]);
  } else {
    run("UPDATE found_courts SET notified_at = datetime('now') WHERE id = ?", [id]);
  }
}

function getUnnotifiedCourts() {
  return getRows('SELECT * FROM found_courts WHERE notified_at IS NULL ORDER BY date, time');
}

function getAllCourts(filters = {}) {
  let sql = 'SELECT * FROM found_courts WHERE 1=1';
  const params = [];
  if (filters.club) {
    sql += ' AND club LIKE ?';
    params.push(`%${filters.club}%`);
  }
  if (filters.date) {
    sql += ' AND date = ?';
    params.push(filters.date);
  }
  sql += ' ORDER BY date DESC, time ASC';
  return getRows(sql, params);
}

function getCourtsForClubAndDates(club, dates) {
  if (dates.length === 0) return [];
  const placeholders = dates.map(() => '?').join(',');
  return getRows(
    `SELECT * FROM found_courts WHERE club = ? AND date IN (${placeholders})`,
    [club, ...dates]
  );
}

function removeCourt(id) {
  run('DELETE FROM found_courts WHERE id = ?', [id]);
}

function clearCourts() {
  run('DELETE FROM found_courts');
  run('DELETE FROM telegram_messages');
}

function getCourtCount() {
  const row = getRow('SELECT COUNT(*) as count FROM found_courts');
  return row ? row.count : 0;
}

// --- Telegram Messages ---

function getTelegramMessage(club, date) {
  const row = getRow('SELECT message_id FROM telegram_messages WHERE club = ? AND date = ?', [club, date]);
  return row ? row.message_id : null;
}

function setTelegramMessage(club, date, messageId) {
  run(
    'INSERT INTO telegram_messages (club, date, message_id) VALUES (?, ?, ?) ON CONFLICT(club, date) DO UPDATE SET message_id = excluded.message_id',
    [club, date, messageId]
  );
}

function removeTelegramMessage(club, date) {
  run('DELETE FROM telegram_messages WHERE club = ? AND date = ?', [club, date]);
}

function getAllTelegramMessages() {
  return getRows('SELECT * FROM telegram_messages');
}

// --- Logs ---

function addLog(level, message) {
  run('INSERT INTO logs (level, message) VALUES (?, ?)', [level, message]);
  run(`DELETE FROM logs WHERE id NOT IN (SELECT id FROM logs ORDER BY id DESC LIMIT ${MAX_LOGS})`);
}

function getLogs(limit = 100) {
  return getRows('SELECT * FROM logs ORDER BY id DESC LIMIT ?', [limit]);
}

function clearLogs() {
  run('DELETE FROM logs');
}

module.exports = {
  init,
  getConfig,
  setConfig,
  getAllConfig,
  insertCourt,
  markNotified,
  getUnnotifiedCourts,
  getAllCourts,
  getCourtsForClubAndDates,
  removeCourt,
  clearCourts,
  getCourtCount,
  getTelegramMessage,
  setTelegramMessage,
  removeTelegramMessage,
  getAllTelegramMessages,
  addLog,
  getLogs,
  clearLogs,
};
