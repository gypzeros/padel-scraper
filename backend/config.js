const db = require('./db');
const fs = require('fs');
const path = require('path');

// Load .env file
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const match = line.match(/^\s*([^#=]+?)\s*=\s*(.*?)\s*$/);
    if (match && match[2]) process.env[match[1]] = match[2];
  }
}

const DEFAULTS = {
  clubs: ['https://playtomic.com/clubs/migracion-psm-fantasy'],
  dateFrom: 'today',
  dateTo: 'today+10',
  timeFrom: '16:00',
  timeTo: '21:00',
  days: [1, 2, 3, 4, 5, 6, 0], // lunes=1 ... domingo=0
  duration: 90,
  intervalSeconds: 30,
  smtpHost: '',
  smtpPort: 587,
  smtpUser: '',
  smtpPass: '',
  emailTo: '',
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
  scraperActive: false,
};

function load() {
  const stored = db.getAllConfig();
  const cfg = { ...DEFAULTS };
  for (const [key, val] of Object.entries(stored)) {
    cfg[key] = val;
  }
  // .env always wins for Telegram credentials
  if (process.env.TELEGRAM_BOT_TOKEN) cfg.telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  if (process.env.TELEGRAM_CHAT_ID) cfg.telegramChatId = process.env.TELEGRAM_CHAT_ID;
  return cfg;
}

function save(cfg) {
  for (const [key, value] of Object.entries(cfg)) {
    if (key in DEFAULTS) {
      db.setConfig(key, value);
    }
  }
}

function get(key) {
  const val = db.getConfig(key);
  return val !== null ? val : DEFAULTS[key];
}

function set(key, value) {
  db.setConfig(key, value);
}

module.exports = { load, save, get, set, DEFAULTS };
