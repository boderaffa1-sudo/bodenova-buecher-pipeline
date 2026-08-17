// ═══════════════════════════════════════════════════════════════════
// stats.js — Dashboard-Endpoint für Live-Statistiken
// ═══════════════════════════════════════════════════════════════════
// Nutzbar für Dashboard-Frontend oder Monitoring.

const express = require('express');
const router = express.Router();
const airtable = require('../clients/airtable');
const { logger } = require('../utils/logger');

router.get('/', async (req, res) => {
  try {
    // Photo_Queue
    const photoQueueRecords = [];
    await airtable.photoQueue.select({
      fields: ['Status', 'AI_Category', 'Consolidated', 'Ordner'],
      pageSize: 100
    }).eachPage((page, next) => {
      photoQueueRecords.push(...page.map(r => r.fields));
      next();
    });
    
    // Inventory (Books only)
    const inventoryRecords = [];
    await airtable.inventory.select({
      filterByFormula: `{Category} = 'Book'`,
      fields: ['Status', 'Processing_Status', 'Approved_for_Listing', 'Ready_to_List', 'Sold Date',
               'Booklooker_Listing_ID', 'AbeBooks_Listing_ID', 'eBay_Listing_ID', 'Etsy_Listing_ID'],
      pageSize: 100
    }).eachPage((page, next) => {
      inventoryRecords.push(...page.map(r => r.fields));
      next();
    });
    
    const stats = {
      timestamp: new Date().toISOString(),
      photo_queue: {
        total: photoQueueRecords.length,
        by_status: countBy(photoQueueRecords, 'Status'),
        buecher_verarbeitet: photoQueueRecords.filter(r => r.Ordner === 'Buecher').length,
        consolidated: photoQueueRecords.filter(r => r.Consolidated).length,
        pending_consolidation: photoQueueRecords.filter(r => r.AI_Category === 'Buch' && !r.Consolidated).length
      },
      books: {
        total: inventoryRecords.length,
        approved_for_listing: inventoryRecords.filter(r => r.Approved_for_Listing).length,
        ready_to_list: inventoryRecords.filter(r => r.Ready_to_List).length,
        listed_booklooker: inventoryRecords.filter(r => r.Booklooker_Listing_ID).length,
        listed_abebooks: inventoryRecords.filter(r => r.AbeBooks_Listing_ID).length,
        listed_ebay: inventoryRecords.filter(r => r.eBay_Listing_ID).length,
        sold: inventoryRecords.filter(r => r['Sold Date']).length,
        by_processing_status: countBy(inventoryRecords, 'Processing_Status')
      },
      workers: req.app.locals.workerState
    };
    
    res.json(stats);
  } catch (err) {
    logger.error({ err: err.message }, 'Stats failed');
    res.status(500).json({ error: err.message });
  }
});

function countBy(records, field) {
  const counts = {};
  for (const r of records) {
    const v = r[field] || 'null';
    counts[v] = (counts[v] || 0) + 1;
  }
  return counts;
}

module.exports = router;
