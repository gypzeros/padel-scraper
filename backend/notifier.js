const nodemailer = require('nodemailer');
const https = require('https');
const config = require('./config');
const db = require('./db');

const DAY_FULL = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];

function formatFiltersBlock(cfg) {
  const dateFrom = cfg.dateFrom || 'today';
  const dateTo = cfg.dateTo || 'today+7';
  const dayNames = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
  const dayOrder = [1, 2, 3, 4, 5, 6, 0];
  const days = dayOrder.filter(d => (cfg.days || []).includes(d)).map(d => dayNames[d]).join(', ');
  const clubs = (cfg.clubs || []).map(u => u.split('/clubs/')[1] || u).join(', ');

  return [
    '\u2699\ufe0f Filtros activos',
    `\ud83d\udcc5 ${dateFrom} \u2192 ${dateTo} | \u23f0 ${cfg.timeFrom || '00:00'}-${cfg.timeTo || '23:59'}`,
    `\ud83d\udcc6 ${days}`,
    `\ud83c\udfdf\ufe0f ${clubs}`,
  ].join('\n');
}

function formatClubBlock(club, courtsByDate, changes) {
  const lines = [`\ud83c\udfdf\ufe0f ${club}`];

  const goneByDate = {};
  const newByDate = {};
  if (changes) {
    for (const s of changes.goneSlots) {
      if (!goneByDate[s.date]) goneByDate[s.date] = new Set();
      goneByDate[s.date].add(s.time);
    }
    for (const s of changes.newSlots) {
      if (!newByDate[s.date]) newByDate[s.date] = new Set();
      newByDate[s.date].add(s.time);
    }
  }

  const dates = Object.keys(courtsByDate).sort();
  for (const dateStr of dates) {
    const d = new Date(dateStr + 'T12:00:00');
    const dayName = DAY_FULL[d.getDay()];
    const [, m, day] = dateStr.split('-');

    // Check if today or tomorrow
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const tom = new Date(now);
    tom.setDate(tom.getDate() + 1);
    const tomorrowStr = `${tom.getFullYear()}-${String(tom.getMonth()+1).padStart(2,'0')}-${String(tom.getDate()).padStart(2,'0')}`;

    let label = `${dayName} ${day}/${m}`;
    if (dateStr === todayStr) label += ' (Hoy)';
    else if (dateStr === tomorrowStr) label += ' (Manana)';

    const courts = courtsByDate[dateStr];
    const goneTimes = goneByDate[dateStr] || new Set();
    const newTimes = newByDate[dateStr] || new Set();

    lines.push(`\ud83d\udcc5 ${label}`);

    const byTime = {};
    for (const c of courts) {
      if (!byTime[c.time]) byTime[c.time] = 1;
      else byTime[c.time]++;
    }

    const allTimes = new Set([...Object.keys(byTime), ...goneTimes]);
    const sortedTimes = [...allTimes].sort();

    if (sortedTimes.length === 0) {
      lines.push(`   \u274c Sin disponibilidad`);
      continue;
    }

    for (const time of sortedTimes) {
      if (byTime[time]) {
        const suffix = newTimes.has(time) ? '  \u2b50 nuevo!' : '';
        lines.push(`   \ud83d\udfe2 ${time}  (${byTime[time]})${suffix}`);
      } else {
        lines.push(`   \u274c ${time}  ya no disponible`);
      }
    }
  }

  return lines.join('\n');
}

function buildFullMessage(cfg, clubsData) {
  const parts = [formatFiltersBlock(cfg)];

  if (clubsData.length === 0) {
    parts.push('\n\u274c No hay disponibilidad');
  } else {
    for (const { club, courtsByDate, changes } of clubsData) {
      parts.push('');
      parts.push(formatClubBlock(club, courtsByDate, changes));
    }
  }

  parts.push('');
  parts.push(`\ud83d\udd04 ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`);

  return parts.join('\n');
}

// --- Email ---

async function sendEmail(subject, text) {
  const cfg = config.load();
  if (!cfg.smtpHost || !cfg.smtpUser || !cfg.emailTo) {
    throw new Error('Configuracion de email incompleta');
  }

  const transporter = nodemailer.createTransport({
    host: cfg.smtpHost,
    port: cfg.smtpPort,
    secure: cfg.smtpPort === 465,
    auth: { user: cfg.smtpUser, pass: cfg.smtpPass },
  });

  await transporter.sendMail({
    from: cfg.smtpUser,
    to: cfg.emailTo,
    subject,
    text,
  });
}

// --- Telegram ---

function telegramRequest(botToken, method, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url = new URL(`https://api.telegram.org/bot${botToken}/${method}`);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => (responseData += chunk));
      res.on('end', () => {
        const parsed = JSON.parse(responseData);
        if (parsed.ok) resolve(parsed.result);
        else reject(new Error(parsed.description || 'Telegram API error'));
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function deleteAndSendTelegram(text, existingMessageId) {
  const cfg = config.load();
  if (!cfg.telegramBotToken || !cfg.telegramChatId) {
    throw new Error('Configuracion de Telegram incompleta');
  }

  if (existingMessageId) {
    try {
      await telegramRequest(cfg.telegramBotToken, 'deleteMessage', {
        chat_id: cfg.telegramChatId,
        message_id: existingMessageId,
      });
    } catch (err) {
      // Ignore if already deleted
    }
  }

  const result = await telegramRequest(cfg.telegramBotToken, 'sendMessage', {
    chat_id: cfg.telegramChatId,
    text,
  });
  return result.message_id;
}

// --- Public API ---

// Single message ID for the one unified message
const MSG_KEY_CLUB = '_main';
const MSG_KEY_DATE = '_main';

async function sendFullMessage(cfg, clubsData) {
  const message = buildFullMessage(cfg, clubsData);
  const errors = [];

  if (cfg.telegramBotToken && cfg.telegramChatId) {
    try {
      const existingMsgId = db.getTelegramMessage(MSG_KEY_CLUB, MSG_KEY_DATE);
      const newMsgId = await deleteAndSendTelegram(message, existingMsgId);
      db.setTelegramMessage(MSG_KEY_CLUB, MSG_KEY_DATE, newMsgId);
    } catch (err) {
      errors.push(`Telegram: ${err.message}`);
    }
  }

  return errors;
}

async function sendTestNotification() {
  const cfg = config.load();
  const errors = [];

  const message = buildFullMessage(cfg, [{
    club: 'Club de prueba',
    courtsByDate: {
      '2025-01-15': [
        { court_name: 'Pista 1', time: '16:00' },
        { court_name: 'Pista 3', time: '16:00' },
        { court_name: 'Pista 1', time: '18:00' },
      ],
      '2025-01-16': [],
    },
    changes: null,
  }]);

  if (cfg.telegramBotToken && cfg.telegramChatId) {
    try {
      await deleteAndSendTelegram(message, null);
    } catch (err) {
      errors.push(`Telegram: ${err.message}`);
    }
  }

  return errors;
}

async function deleteAllTelegramMessages() {
  const cfg = config.load();
  if (!cfg.telegramBotToken || !cfg.telegramChatId) return;

  const messages = db.getAllTelegramMessages();
  await Promise.all(messages.map(msg =>
    telegramRequest(cfg.telegramBotToken, 'deleteMessage', {
      chat_id: cfg.telegramChatId,
      message_id: msg.message_id,
    }).catch(() => {})
  ));
  db.clearCourts();
}

async function sendAlertTelegram(message) {
  const cfg = config.load();
  if (!cfg.telegramBotToken || !cfg.telegramChatId) return;
  try {
    await telegramRequest(cfg.telegramBotToken, 'sendMessage', {
      chat_id: cfg.telegramChatId,
      text: message,
    });
  } catch (err) {
    // Can't do much if Telegram itself fails
  }
}

// --- Telegram Bot polling ---

let lastUpdateId = 0;

async function pollTelegramMessages(getFullMessageFn) {
  const cfg = config.load();
  if (!cfg.telegramBotToken) return;

  try {
    const updates = await telegramRequest(cfg.telegramBotToken, 'getUpdates', {
      offset: lastUpdateId + 1,
      timeout: 0,
    });

    for (const update of updates) {
      lastUpdateId = update.update_id;
      const chatId = update.message?.chat?.id;
      if (!chatId) continue;

      const message = getFullMessageFn();
      await telegramRequest(cfg.telegramBotToken, 'sendMessage', {
        chat_id: chatId,
        text: message,
      });
    }
  } catch (err) {
    // Silently ignore polling errors
  }
}

module.exports = { sendFullMessage, sendTestNotification, deleteAllTelegramMessages, sendAlertTelegram, pollTelegramMessages, buildFullMessage };
