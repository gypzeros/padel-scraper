const nodemailer = require('nodemailer');
const https = require('https');
const config = require('./config');
const db = require('./db');

const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];

// changes: { newSlots: [{date, time}], goneSlots: [{date, time}] }
function formatClubSummary(club, courtsByDate, baseUrl, changes) {
  const lines = [`\ud83c\udfdf\ufe0f ${club}`];
  lines.push('');

  // Collect gone times per date for marking with X
  const goneByDate = {};
  if (changes) {
    for (const s of changes.goneSlots) {
      if (!goneByDate[s.date]) goneByDate[s.date] = new Set();
      goneByDate[s.date].add(s.time);
    }
  }

  const dates = Object.keys(courtsByDate).sort();
  for (const dateStr of dates) {
    const d = new Date(dateStr + 'T00:00:00');
    const dayName = DAY_SHORT[d.getDay()];
    const [, m, day] = dateStr.split('-');

    const courts = courtsByDate[dateStr];
    const goneTimes = goneByDate[dateStr] || new Set();

    lines.push(`\ud83d\udcc5 ${dayName} ${day}/${m}`);

    // Group current courts by time
    const byTime = {};
    for (const c of courts) {
      if (!byTime[c.time]) {
        byTime[c.time] = 1;
      } else {
        byTime[c.time]++;
      }
    }

    // Collect all times (current + gone) sorted
    const allTimes = new Set([...Object.keys(byTime), ...goneTimes]);
    const sortedTimes = [...allTimes].sort();

    if (sortedTimes.length === 0) {
      lines.push(`   \u274c Sin disponibilidad`);
      lines.push('');
      continue;
    }

    for (const time of sortedTimes) {
      if (byTime[time]) {
        lines.push(`   \ud83d\udfe2 ${time}  (${byTime[time]})`);
      } else {
        // This time was available before but not anymore
        lines.push(`   \u274c ${time}  ya no disponible`);
      }
    }
    lines.push('');
  }

  lines.push(`\ud83d\udd17 ${baseUrl}`);
  lines.push(`\ud83d\udd04 ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`);

  return lines.join('\n');
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

  // Delete old message
  if (existingMessageId) {
    try {
      await telegramRequest(cfg.telegramBotToken, 'deleteMessage', {
        chat_id: cfg.telegramChatId,
        message_id: existingMessageId,
      });
    } catch (err) {
      // Ignore if message was already deleted
    }
  }

  // Send new message (always at the bottom of the chat)
  const result = await telegramRequest(cfg.telegramBotToken, 'sendMessage', {
    chat_id: cfg.telegramChatId,
    text,
  });
  return result.message_id;
}

// --- Public API ---

async function notifyClubSummary(club, courtsByDate, baseUrl, changes) {
  const message = formatClubSummary(club, courtsByDate, baseUrl, changes);
  const errors = [];
  const cfg = config.load();

  if (cfg.telegramBotToken && cfg.telegramChatId) {
    try {
      const existingMsgId = db.getTelegramMessage(club, '_all');
      const newMsgId = await deleteAndSendTelegram(message, existingMsgId);
      db.setTelegramMessage(club, '_all', newMsgId);
    } catch (err) {
      errors.push(`Telegram: ${err.message}`);
    }
  }

  return errors;
}

async function sendTestNotification() {
  const cfg = config.load();
  const errors = [];

  const testMessage = formatClubSummary('Club de prueba', {
    '2025-01-15': [
      { court_name: 'Pista 1 (90min - 20.00 EUR)', time: '16:00' },
      { court_name: 'Pista 3 (90min - 25.00 EUR)', time: '16:00' },
      { court_name: 'Pista 1 (90min - 25.00 EUR)', time: '18:00' },
    ],
    '2025-01-16': [],
    '2025-01-17': [
      { court_name: 'Pista 2 (90min - 30.00 EUR)', time: '19:00' },
    ],
  }, 'https://playtomic.com/test', {
    newSlots: [{ date: '2025-01-17', time: '19:00' }],
    goneSlots: [{ date: '2025-01-16', time: '17:00' }],
  });

  if (cfg.telegramBotToken && cfg.telegramChatId) {
    try {
      await deleteAndSendTelegram(testMessage, null);
    } catch (err) {
      errors.push(`Telegram: ${err.message}`);
    }
  }

  if (cfg.smtpHost && cfg.emailTo) {
    try {
      await sendEmail('Test - Playtomic Scraper', testMessage);
    } catch (err) {
      errors.push(`Email: ${err.message}`);
    }
  }

  return errors;
}

async function sendFiltersMessage(cfg) {
  const errors = [];
  if (!cfg.telegramBotToken || !cfg.telegramChatId) return errors;

  const dateFrom = cfg.dateFrom || 'today';
  const dateTo = cfg.dateTo || 'today+10';
  const dayNames = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
  const dayOrder = [1, 2, 3, 4, 5, 6, 0];
  const days = dayOrder.filter(d => (cfg.days || []).includes(d)).map(d => dayNames[d]).join(', ');
  const clubs = (cfg.clubs || []).map(u => u.split('/clubs/')[1] || u).join(', ');

  const lines = [
    '\u2699\ufe0f Filtros activos',
    '',
    `\ud83d\udcc5 Fechas: ${dateFrom} \u2192 ${dateTo}`,
    `\u23f0 Horas: ${cfg.timeFrom || '00:00'} - ${cfg.timeTo || '23:59'}`,
    `\ud83d\udcc6 Dias: ${days}`,
    `\ud83c\udfdf\ufe0f Clubs: ${clubs}`,
    `\u23f1\ufe0f Intervalo: cada ${cfg.intervalSeconds || 30}s`,
  ];

  try {
    // Delete old filters message if exists
    const existingMsgId = db.getTelegramMessage('_filters', '_filters');
    const newMsgId = await deleteAndSendTelegram(lines.join('\n'), existingMsgId);
    db.setTelegramMessage('_filters', '_filters', newMsgId);
  } catch (err) {
    errors.push(`Telegram: ${err.message}`);
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
  // Clear the table
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

module.exports = { notifyClubSummary, sendTestNotification, sendFiltersMessage, deleteAllTelegramMessages, sendAlertTelegram };
