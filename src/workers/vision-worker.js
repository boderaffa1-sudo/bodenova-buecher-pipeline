// ═══════════════════════════════════════════════════════════════════
// vision-worker.js — Google Drive → OpenAI Vision → Airtable Photo_Queue
// ═══════════════════════════════════════════════════════════════════
// Läuft alle 5 Min. Holt bis zu 20 neue Fotos, verarbeitet parallel.
// Kein n8n-Memory-Limit — Railway hat viel mehr Ressourcen.

const pLimit = require('p-limit');
const pRetry = require('p-retry');
const { logger } = require('../utils/logger');
const config = require('../config');
const airtable = require('../clients/airtable');
const drive = require('../clients/drive');
const openai = require('../clients/openai');

async function runVision() {
  const startTime = Date.now();
  logger.info('Vision-Worker start');

  // 1. Alle Drive-Fotos IDs holen (pageSize 1000)
  const driveFiles = await drive.listImages(config.GOOGLE_DRIVE_FOLDER_ID);
  logger.info({ count: driveFiles.length }, 'Drive files listed');

  // 2. Bereits verarbeitete GDrive-IDs holen
  const processedIds = await airtable.getProcessedGDriveIds();
  logger.info({ processed: processedIds.size }, 'Already processed');

  // 3. Filter: nur neue Fotos
  const newFiles = driveFiles.filter(f => !processedIds.has(f.id));
  logger.info({ new: newFiles.length }, 'New files to process');

  if (newFiles.length === 0) {
    logger.info('No new photos, done');
    return { processed: 0 };
  }

  // 4. Batch begrenzen
  const batch = newFiles.slice(0, config.VISION_BATCH_SIZE);
  logger.info({ batchSize: batch.length }, 'Processing batch');

  // 5. Parallel-Verarbeitung mit Rate-Limit
  const limit = pLimit(config.VISION_CONCURRENCY);
  const results = await Promise.allSettled(
    batch.map(file => limit(() => processOnePhoto(file)))
  );

  // 6. Ergebnisse zusammenfassen
  const success = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;
  const duration = Date.now() - startTime;

  logger.info({ 
    processed: batch.length, 
    success, 
    failed, 
    durationMs: duration,
    filesRemaining: newFiles.length - batch.length
  }, 'Vision-Worker done');

  return { processed: batch.length, success, failed, remaining: newFiles.length - batch.length };
}

async function processOnePhoto(file) {
  logger.debug({ fileId: file.id, filename: file.name }, 'Processing photo');

  // 1. Foto von Drive holen (als Buffer)
  const imageBuffer = await pRetry(
    () => drive.downloadFile(file.id),
    { retries: 2, minTimeout: 1000 }
  );

  // 2. Base64-encoden (sauber, ohne Newlines!)
  const base64Image = imageBuffer.toString('base64');
  
  // Validierung: Base64 muss reines Base64 sein (kein Whitespace)
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64Image)) {
    throw new Error(`Invalid base64 for ${file.name}`);
  }

  // 3. OpenAI Vision aufrufen (mit Retry)
  const vision = await pRetry(
    () => openai.analyzeBookPhoto(base64Image, file.name),
    { 
      retries: config.MAX_RETRIES_PER_PHOTO, 
      minTimeout: 2000,
      onFailedAttempt: (err) => {
        logger.warn({ fileId: file.id, attempt: err.attemptNumber, err: err.message }, 'OpenAI retry');
      }
    }
  );

  // 4. In Photo_Queue schreiben
  const record = await airtable.createPhotoQueueRecord({
    GDrive_File_ID: file.id,
    GDrive_Filename: file.name,
    Dateiname: file.name,
    Foto_Zeit: extractTimestampFromFilename(file.name) || file.createdTime,
    Ordner: 'Buecher',
    Status: 'Verarbeitet',
    AI_Objekttyp: vision.objekttyp,
    AI_Object_Type: vision.objekttyp,
    Titel: vision.titel || '',
    Autor: vision.autor || '',
    Band: vision.band ? String(vision.band) : '',
    Reihe: vision.reihe || '',
    Verlag: vision.verlag || '',
    Jahr: vision.jahr || null,
    ISBN: vision.isbn || '',
    Sprache: vision.sprache || '',
    Kategorie: vision.kategorie || 'unbekannt',
    AI_Zustand: vision.zustand || 'unbekannt',
    AI_Grouping_Hash: makeGroupingHash(vision.titel, vision.band),
    Vergilbung_Grad: vision.vergilbung_grad || null,
    Antiquarisch: !!vision.antiquarisch,
    Erstausgabe: !!vision.erstausgabe,
    Signiert: !!vision.signiert,
    AI_Beschreibung_Kurz: vision.autor && vision.titel 
      ? `${vision.autor} — ${vision.titel}${vision.band ? ` [Band ${vision.band}]` : ''}`
      : (vision.titel || 'kein Titel'),
    Processed_At: new Date().toISOString()
  });

  // 5. Read-after-Write Verification
  const verify = await airtable.getPhotoQueueRecord(record.id);
  if (!verify || verify.fields.GDrive_File_ID !== file.id) {
    throw new Error(`Verification failed for ${file.name}`);
  }

  logger.debug({ 
    fileId: file.id, 
    titel: vision.titel, 
    objekttyp: vision.objekttyp 
  }, 'Photo processed');

  return { fileId: file.id, recordId: record.id, vision };
}

function extractTimestampFromFilename(filename) {
  // Pattern: YYYYMMDD_HHMMSS.jpg
  const m = filename.match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}Z`;
}

function makeGroupingHash(titel, band) {
  if (!titel) return 'unbekannt';
  const clean = titel.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '')
    .substring(0, 35);
  return clean + (band ? `_band${band}` : '');
}

module.exports = { runVision, processOnePhoto };

// CLI-Mode: node vision-worker.js --dry-run
if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) {
    logger.info('DRY-RUN mode: processing 1 photo only');
    config.VISION_BATCH_SIZE = 1;
  }
  runVision()
    .then(result => {
      logger.info({ result }, 'Done');
      process.exit(0);
    })
    .catch(err => {
      logger.error({ err }, 'Failed');
      process.exit(1);
    });
}
