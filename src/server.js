// ═══════════════════════════════════════════════════════════════════
// server.js — Bodenova Books Worker Hauptserver
// ═══════════════════════════════════════════════════════════════════
// Startet Express-Server + registriert alle Cron-Worker.
// Läuft auf Railway. Ein Prozess für alle Worker.
//
// Härtung eingebaut (nach Code-Review):
// - helmet: Security-Header
// - express-rate-limit: Anti-Spam für /trigger und /api/*
// - cors: konfiguriert für Frontend-URL
// - morgan: Request-Logging
// - Env-Var-Validation beim Start (Fail-fast)

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const { logger } = require('./utils/logger');
const config = require('./config');

// ── Start-Validierung ──────────────────────────────────────────────
validateEnvOnBoot();

const app = express();

// ── Security-Header (Helmet) ───────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // Dashboard braucht evtl. inline styles
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// ── CORS ───────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: false,
  methods: ['GET', 'POST']
}));

// ── Request-Logging ────────────────────────────────────────────────
if (config.NODE_ENV === 'production') {
  app.use(morgan('combined', {
    skip: (req) => req.path === '/health' // Health-Checks nicht loggen
  }));
} else {
  app.use(morgan('dev'));
}

// ── Body-Parser ────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));

// ── Rate-Limiting für sensible Endpoints ───────────────────────────
const triggerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 Min
  max: 10,                  // 10 manuelle Trigger pro 15 Min pro IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zu viele Trigger-Requests. Bitte später versuchen.' }
});

app.use('/trigger', triggerLimiter);

// ── Routes ─────────────────────────────────────────────────────────
app.use('/health', require('./routes/health'));
app.use('/trigger', require('./routes/trigger'));
app.use('/stats', require('./routes/stats'));

// ── 404 ────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

// ── Global Error Handler ───────────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error({ err: err.message, stack: err.stack, path: req.path }, 'Unhandled error');
  res.status(err.status || 500).json({ 
    error: err.message || 'Server error',
    path: req.path
  });
});

// ── Worker State (für Crash-Loop-Detection) ─────────────────────────
const workerState = {
  vision: { runs: 0, lastError: null, consecutiveFails: 0, paused: false, lastRun: null },
  consolidator: { runs: 0, lastError: null, consecutiveFails: 0, paused: false, lastRun: null },
  pricing: { runs: 0, lastError: null, consecutiveFails: 0, paused: false, lastRun: null },
  listing: { runs: 0, lastError: null, consecutiveFails: 0, paused: false, lastRun: null },
  crossDelist: { runs: 0, lastError: null, consecutiveFails: 0, paused: false, lastRun: null }
};
app.locals.workerState = workerState;

// ── Crash-Loop-Wrapper ─────────────────────────────────────────────
async function runWorkerSafely(name, fn) {
  const state = workerState[name];
  if (state.paused) {
    logger.warn({ worker: name }, 'Worker paused (crash-loop), skipping');
    return;
  }
  state.lastRun = new Date().toISOString();
  try {
    await fn();
    state.runs++;
    state.consecutiveFails = 0;
    state.lastError = null;
  } catch (err) {
    state.consecutiveFails++;
    state.lastError = err.message;
    logger.error({ 
      worker: name, 
      err: err.message, 
      consecutiveFails: state.consecutiveFails 
    }, 'Worker failed');
    
    if (state.consecutiveFails >= config.MAX_CRASH_LOOPS) {
      state.paused = true;
      logger.fatal({ worker: name }, `Worker PAUSED after ${config.MAX_CRASH_LOOPS} consecutive failures`);
      await sendAlert(`🚨 Worker "${name}" pausiert nach ${config.MAX_CRASH_LOOPS} Fehlern. Fehler: ${err.message}`);
    }
  }
}

async function sendAlert(message) {
  // Telegram-Alert wenn konfiguriert
  if (config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID) {
    try {
      await fetch(`https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: config.TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: 'HTML'
        })
      });
    } catch (e) {
      logger.error({ e: e.message }, 'Telegram alert failed');
    }
  }
}

// ── Cron-Trigger ───────────────────────────────────────────────────
if (config.NODE_ENV === 'production' || process.env.ENABLE_CRONS === 'true') {
  // Vision: alle 5 Min
  cron.schedule('*/5 * * * *', async () => {
    const { runVision } = require('./workers/vision-worker');
    await runWorkerSafely('vision', runVision);
  });

  // Consolidator: alle 15 Min
  cron.schedule('*/15 * * * *', async () => {
    const { runConsolidator } = require('./workers/consolidator');
    await runWorkerSafely('consolidator', runConsolidator);
  });

  // Pricing: alle 2h
  cron.schedule('0 */2 * * *', async () => {
    const { runPricing } = require('./workers/pricing');
    await runWorkerSafely('pricing', runPricing);
  });

  // Listing: alle 30 Min
  cron.schedule('*/30 * * * *', async () => {
    const { runListing } = require('./workers/listing');
    await runWorkerSafely('listing', runListing);
  });

  // Cross-Delist: alle 15 Min
  cron.schedule('*/15 * * * *', async () => {
    const { runCrossDelist } = require('./workers/cross-delist');
    await runWorkerSafely('crossDelist', runCrossDelist);
  });

  logger.info('Cron workers registered');
} else {
  logger.info('Cron workers DISABLED (dev mode). Set ENABLE_CRONS=true to enable.');
}

// ── Start ──────────────────────────────────────────────────────────
const PORT = config.PORT;
app.listen(PORT, '0.0.0.0', () => {
  logger.info({
    port: PORT,
    env: config.NODE_ENV,
    cronsEnabled: config.NODE_ENV === 'production' || process.env.ENABLE_CRONS === 'true'
  }, '🚀 Bodenova Books Worker started');
});

// ── Graceful Shutdown ──────────────────────────────────────────────
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason: String(reason) }, 'Unhandled Rejection');
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err: err.message, stack: err.stack }, 'Uncaught Exception');
  // Nicht sofort exit — Railway restartet automatisch bei Prozessende
});

// ── Env-Validation ─────────────────────────────────────────────────
function validateEnvOnBoot() {
  const critical = [
    'AIRTABLE_PAT',
    'AIRTABLE_BASE_ID',
    'GOOGLE_DRIVE_FOLDER_ID',
    'OPENAI_API_KEY'
  ];
  const missing = critical.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.error(`\n❌ FATAL: Missing required env vars:\n  - ${missing.join('\n  - ')}\n`);
    console.error('Set them in Railway Dashboard → Variables\n');
    process.exit(1);
  }
  
  const warnings = [];
  if (!process.env.BOOKLOOKER_API_KEY) warnings.push('BOOKLOOKER_API_KEY — Booklooker-Listing wird nicht funktionieren');
  if (!process.env.RESEND_API_KEY) warnings.push('RESEND_API_KEY — Mail-Alerts + AbeBooks CSV-Mail deaktiviert');
  if (!process.env.SUPABASE_URL) warnings.push('SUPABASE_URL — Salvante-Sync deaktiviert');
  if (!process.env.EBAY_CLIENT_ID) warnings.push('EBAY_CLIENT_ID — eBay-Listing deaktiviert');
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON_B64) warnings.push('GOOGLE_SERVICE_ACCOUNT_JSON_B64 — Google Drive Zugriff nicht möglich!');
  if (!process.env.TELEGRAM_BOT_TOKEN) warnings.push('TELEGRAM_BOT_TOKEN — Alerts nicht möglich');
  
  if (warnings.length > 0) {
    console.warn('\n⚠️  Optionale Env-Vars fehlen:');
    warnings.forEach(w => console.warn(`  - ${w}`));
    console.warn('');
  }
}
