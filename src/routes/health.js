// ═══════════════════════════════════════════════════════════════════
// health.js — /health Endpoint
// ═══════════════════════════════════════════════════════════════════
// Railway nutzt das für Healthcheck. Zeigt Status jedes verbundenen
// Services zurück (nicht nur "ok", sondern was läuft/was fehlt).

const express = require('express');
const router = express.Router();
const config = require('../config');

router.get('/', (req, res) => {
  const state = req.app.locals.workerState || {};
  
  const health = {
    status: 'ok',
    service: 'bodenova-books-worker',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime_seconds: Math.floor(process.uptime()),
    env: config.NODE_ENV,
    services: {
      airtable: !!config.AIRTABLE_PAT ? 'connected' : 'missing',
      google_drive: !!config.GOOGLE_SERVICE_ACCOUNT_JSON_B64 ? 'connected' : 'missing',
      openai: !!config.OPENAI_API_KEY ? 'connected' : 'missing',
      booklooker: !!config.BOOKLOOKER_API_KEY ? 'connected' : 'optional',
      supabase_salvante: !!config.SUPABASE_URL ? 'connected' : 'optional',
      ebay: !!config.EBAY_CLIENT_ID ? 'connected' : 'optional',
      resend: !!config.RESEND_API_KEY ? 'connected' : 'optional',
      telegram: !!config.TELEGRAM_BOT_TOKEN ? 'connected' : 'optional'
    },
    workers: {
      vision: workerHealth(state.vision),
      consolidator: workerHealth(state.consolidator),
      pricing: workerHealth(state.pricing),
      listing: workerHealth(state.listing),
      crossDelist: workerHealth(state.crossDelist)
    }
  };
  
  // Wenn ein Worker paused → status = degraded
  const anyPaused = Object.values(health.workers).some(w => w.paused);
  if (anyPaused) health.status = 'degraded';
  
  res.status(200).json(health);
});

function workerHealth(state) {
  if (!state) return { status: 'not_started', runs: 0 };
  return {
    status: state.paused ? 'paused_crash_loop' : 'ok',
    runs: state.runs,
    lastRun: state.lastRun,
    lastError: state.lastError,
    paused: state.paused,
    consecutiveFails: state.consecutiveFails
  };
}

module.exports = router;
