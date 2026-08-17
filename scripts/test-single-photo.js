// ═══════════════════════════════════════════════════════════════════
// test-single-photo.js — Debug-Test mit 1 spezifischem Foto
// ═══════════════════════════════════════════════════════════════════
// Nutzung:
//   node scripts/test-single-photo.js <GDRIVE_FILE_ID>
//
// Beispiel (eines der 32 Band-Beispiel-Fotos):
//   node scripts/test-single-photo.js 1_uUzVPW04EBhAO4zrFeJdvFxM19V2u7M

const { logger } = require('../src/utils/logger');
const drive = require('../src/clients/drive');
const openai = require('../src/clients/openai');

async function main() {
  const fileId = process.argv[2];
  if (!fileId) {
    console.error('Usage: node scripts/test-single-photo.js <GDRIVE_FILE_ID>');
    process.exit(1);
  }
  
  logger.info({ fileId }, '═══ Test-Photo Analyse ═══');
  
  // 1. Foto von Drive laden
  console.log('\n[1/4] Foto laden...');
  const buffer = await drive.downloadFile(fileId);
  console.log(`      ✓ ${buffer.length} bytes`);
  
  // 2. Base64
  console.log('\n[2/4] Base64 encoden...');
  const base64 = buffer.toString('base64');
  console.log(`      ✓ ${base64.length} chars`);
  
  // Validierung
  const valid = /^[A-Za-z0-9+/]+={0,2}$/.test(base64);
  console.log(`      Validierung: ${valid ? '✓ sauber' : '❌ enthält ungültige Zeichen'}`);
  
  // 3. OpenAI Vision
  console.log('\n[3/4] OpenAI Vision aufrufen...');
  const result = await openai.analyzeBookPhoto(base64, `test-${fileId}.jpg`);
  console.log('\n═══ Vision-Ergebnis ═══');
  console.log(JSON.stringify(result, null, 2));
  
  // 4. Kosten-Schätzung
  const cost = openai.estimateCost(1);
  console.log(`\n[4/4] Geschätzte Kosten: $${cost.toFixed(6)}`);
  
  process.exit(0);
}

main().catch(err => {
  logger.error({ err: err.message, stack: err.stack }, 'Test failed');
  process.exit(1);
});
