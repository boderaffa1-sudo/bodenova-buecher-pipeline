// ═══════════════════════════════════════════════════════════════════
// listing.js — Verteilt Bücher auf Booklooker / AbeBooks / eBay / Salvante
// ═══════════════════════════════════════════════════════════════════
// TODO: Adapter für jede Plattform implementieren

const { logger } = require('../utils/logger');

async function runListing() {
  logger.info('Listing-Worker: TODO — Booklooker/AbeBooks/eBay/Salvante-Adapter implementieren');
  return { skipped: true, reason: 'Not implemented yet' };
}

module.exports = { runListing };
