// ═══════════════════════════════════════════════════════════════════
// trigger.js — Manuelle Trigger für Worker (Development + Debugging)
// ═══════════════════════════════════════════════════════════════════
// GESCHÜTZT: nur mit TRIGGER_TOKEN als Header X-Trigger-Token
// Rate-Limited: 10 Requests / 15 Min pro IP (aus server.js)

const express = require('express');
const router = express.Router();
const config = require('../config');
const { logger } = require('../utils/logger');

// Auth-Middleware
router.use((req, res, next) => {
  const token = req.headers['x-trigger-token'] || req.query.token;
  const expectedToken = process.env.TRIGGER_TOKEN;
  
  if (!expectedToken) {
    return res.status(503).json({ error: 'TRIGGER_TOKEN not set in env' });
  }
  if (token !== expectedToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// Worker manuell auslösen
router.post('/:worker', async (req, res) => {
  const { worker } = req.params;
  const workers = {
    vision: () => require('../workers/vision-worker').runVision(),
    consolidator: () => require('../workers/consolidator').runConsolidator(),
    pricing: () => require('../workers/pricing').runPricing(),
    listing: () => require('../workers/listing').runListing(),
    crossdelist: () => require('../workers/cross-delist').runCrossDelist()
  };
  
  if (!workers[worker]) {
    return res.status(404).json({ error: `Unknown worker: ${worker}`, available: Object.keys(workers) });
  }
  
  logger.info({ worker }, 'Manual trigger via HTTP');
  
  // Async ausführen, direkt antworten
  workers[worker]()
    .then(result => {
      logger.info({ worker, result }, 'Manual trigger completed');
    })
    .catch(err => {
      logger.error({ worker, err: err.message }, 'Manual trigger failed');
    });
  
  res.status(202).json({ 
    accepted: true, 
    worker, 
    message: 'Worker läuft im Hintergrund. Check /stats für Fortschritt.' 
  });
});

// Worker-State zurücksetzen (Crash-Loop entpausieren)
router.post('/:worker/resume', (req, res) => {
  const { worker } = req.params;
  const state = req.app.locals.workerState[worker];
  if (!state) return res.status(404).json({ error: 'Worker not found' });
  
  state.paused = false;
  state.consecutiveFails = 0;
  state.lastError = null;
  
  logger.info({ worker }, 'Worker resumed manually');
  res.json({ ok: true, worker });
});

module.exports = router;
