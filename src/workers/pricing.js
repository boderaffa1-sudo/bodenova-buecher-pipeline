// ═══════════════════════════════════════════════════════════════════
// pricing.js — Marktrecherche + Preisstrategie C
// ═══════════════════════════════════════════════════════════════════
// TODO: Booklooker-API + eBay-Suche für ISBN
// Strategie C: Median Marktpreis, dann -0.50€ Unterbieten
// Bei Antiquarisch: Median × 1.15-1.20

const { logger } = require('../utils/logger');
const airtable = require('../clients/airtable');

async function runPricing() {
  logger.info('Pricing-Worker: TODO — Booklooker + eBay Marktrecherche implementieren');
  // Placeholder für Live-Deploy — implementiere nach Vision + Consolidator läuft
  return { skipped: true, reason: 'Not implemented yet' };
}

module.exports = { runPricing };
