// ═══════════════════════════════════════════════════════════════════
// logger.js — Strukturiertes Logging mit Pino
// ═══════════════════════════════════════════════════════════════════
// Ausgabe geht direkt in Railway-Logs, JSON-Format für Filterung.

const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label })
  },
  timestamp: () => `,"ts":"${new Date().toISOString()}"`
});

module.exports = { logger };
