// ═══════════════════════════════════════════════════════════════════
// airtable.js — Airtable Client mit Rate-Limit + Read-after-Write
// ═══════════════════════════════════════════════════════════════════

const Airtable = require('airtable');
const config = require('../config');
const { logger } = require('../utils/logger');

Airtable.configure({ apiKey: config.AIRTABLE_PAT });
const base = Airtable.base(config.AIRTABLE_BASE_ID);

const photoQueue = base(config.AIRTABLE_TABLE_PHOTO_QUEUE);
const inventory = base(config.AIRTABLE_TABLE_INVENTORY);
const books = base(config.AIRTABLE_TABLE_BOOKS);

// ── Photo_Queue ────────────────────────────────────────────────────

async function getProcessedGDriveIds() {
  const ids = new Set();
  await photoQueue.select({
    fields: ['GDrive_File_ID'],
    filterByFormula: `{GDrive_File_ID} != ''`,
    pageSize: 100
  }).eachPage((records, next) => {
    records.forEach(r => {
      const id = r.fields.GDrive_File_ID;
      if (id) ids.add(id);
    });
    next();
  });
  return ids;
}

async function createPhotoQueueRecord(fields) {
  const created = await photoQueue.create([{ fields }], { typecast: true });
  return created[0];
}

async function getPhotoQueueRecord(recordId) {
  try {
    return await photoQueue.find(recordId);
  } catch (err) {
    return null;
  }
}

async function listUnconsolidatedPhotos(limit = 100) {
  const records = [];
  await photoQueue.select({
    filterByFormula: `AND(
      {AI_Category} = 'Buch',
      OR({Consolidated} = FALSE(), {Consolidated} = BLANK())
    )`,
    pageSize: 100,
    maxRecords: limit,
    sort: [{ field: 'Foto_Zeit', direction: 'asc' }]
  }).eachPage((page, next) => {
    records.push(...page);
    next();
  });
  return records;
}

// ── Inventory Items (Books) ─────────────────────────────────────────

async function createInventoryBook(fields) {
  // Kategorie automatisch auf "Book" setzen
  fields.Category = 'Book';
  const created = await inventory.create([{ fields }], { typecast: true });
  return created[0];
}

async function updateInventoryRecord(recordId, fields) {
  const updated = await inventory.update([{ id: recordId, fields }], { typecast: true });
  
  // READ-AFTER-WRITE Verification
  const verify = await inventory.find(recordId);
  const failed = [];
  for (const [k, v] of Object.entries(fields)) {
    if (verify.fields[k] === undefined || verify.fields[k] === null) {
      // Feld wurde nicht gesetzt — evtl. Formel-Feld oder Validation-Block
      failed.push({ field: k, expected: v, actual: verify.fields[k] });
    }
  }
  if (failed.length > 0) {
    logger.warn({ recordId, failed }, 'Airtable silent-fail: fields not written');
  }
  
  return updated[0];
}

async function findBookByHash(hash) {
  const records = await inventory.select({
    filterByFormula: `AND({Category} = 'Book', {Grouping_Hash} = '${hash}')`,
    maxRecords: 1
  }).firstPage();
  return records[0] || null;
}

async function listBooksReadyForListing(platform) {
  // platform: 'Booklooker' | 'AbeBooks' | 'eBay' | 'Salvante'
  const listedField = `${platform}_Listing_ID`;
  const records = [];
  await inventory.select({
    filterByFormula: `AND(
      {Category} = 'Book',
      {Approved_for_Listing} = TRUE(),
      OR({${listedField}} = '', {${listedField}} = BLANK())
    )`,
    pageSize: 50
  }).eachPage((page, next) => {
    records.push(...page);
    next();
  });
  return records;
}

module.exports = {
  photoQueue,
  inventory,
  books,
  getProcessedGDriveIds,
  createPhotoQueueRecord,
  getPhotoQueueRecord,
  listUnconsolidatedPhotos,
  createInventoryBook,
  updateInventoryRecord,
  findBookByHash,
  listBooksReadyForListing
};
