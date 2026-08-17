// ═══════════════════════════════════════════════════════════════════
// config.js — Zentrale Environment-Config
// ═══════════════════════════════════════════════════════════════════
// Alle ENV-Vars werden hier eingelesen, mit Defaults und Validierung.
// Fehlende kritische Vars → Crash beim Start (nicht später silent fail).

function required(name) {
  const val = process.env[name];
  if (!val) {
    console.error(`FATAL: Missing required env var ${name}`);
    process.exit(1);
  }
  return val;
}

function optional(name, defaultVal) {
  return process.env[name] || defaultVal;
}

module.exports = {
  // Runtime
  PORT: parseInt(optional('PORT', '3000'), 10),
  NODE_ENV: optional('NODE_ENV', 'production'),

  // Airtable
  AIRTABLE_PAT: required('AIRTABLE_PAT'),
  AIRTABLE_BASE_ID: required('AIRTABLE_BASE_ID'),
  AIRTABLE_TABLE_INVENTORY: optional('AIRTABLE_TABLE_INVENTORY', 'tblxHGAquMrRoUn5p'),
  AIRTABLE_TABLE_PHOTO_QUEUE: optional('AIRTABLE_TABLE_PHOTO_QUEUE', 'tblSENLJuXV5Nd8O9'),
  AIRTABLE_TABLE_BOOKS: optional('AIRTABLE_TABLE_BOOKS', 'tblEzZCBcwpPJmEl7'),

  // Google Drive
  GOOGLE_SERVICE_ACCOUNT_JSON_B64: optional('GOOGLE_SERVICE_ACCOUNT_JSON_B64', ''),
  GOOGLE_DRIVE_FOLDER_ID: required('GOOGLE_DRIVE_FOLDER_ID'),

  // OpenAI
  OPENAI_API_KEY: required('OPENAI_API_KEY'),
  OPENAI_MODEL: optional('OPENAI_MODEL', 'gpt-4o-mini'),
  OPENAI_VISION_DETAIL: optional('OPENAI_VISION_DETAIL', 'low'),

  // Booklooker
  BOOKLOOKER_API_KEY: optional('BOOKLOOKER_API_KEY', ''),

  // AbeBooks
  ABEBOOKS_BOOKSELLER_ID: optional('ABEBOOKS_BOOKSELLER_ID', '89785814'),
  ABEBOOKS_EMAIL_TO: optional('ABEBOOKS_EMAIL_TO', 'bode@bodenova.de'),

  // eBay
  EBAY_CLIENT_ID: optional('EBAY_CLIENT_ID', ''),
  EBAY_CLIENT_SECRET: optional('EBAY_CLIENT_SECRET', ''),
  EBAY_REFRESH_TOKEN: optional('EBAY_REFRESH_TOKEN', ''),
  EBAY_SANDBOX: optional('EBAY_SANDBOX', 'false') === 'true',

  // Salvante (Supabase)
  SUPABASE_URL: optional('SUPABASE_URL', ''),
  SUPABASE_SERVICE_ROLE_KEY: optional('SUPABASE_SERVICE_ROLE_KEY', ''),

  // Notifications
  RESEND_API_KEY: optional('RESEND_API_KEY', ''),
  NOTIFY_EMAIL: optional('NOTIFY_EMAIL', 'bode@bodenova.de'),
  FROM_EMAIL: optional('FROM_EMAIL', 'Bodenova <noreply@bodenova.de>'),
  TELEGRAM_BOT_TOKEN: optional('TELEGRAM_BOT_TOKEN', ''),
  TELEGRAM_CHAT_ID: optional('TELEGRAM_CHAT_ID', ''),

  // Worker-Config
  VISION_BATCH_SIZE: parseInt(optional('VISION_BATCH_SIZE', '20'), 10),
  VISION_CONCURRENCY: parseInt(optional('VISION_CONCURRENCY', '5'), 10),
  CONSOLIDATOR_INTERVAL_MIN: parseInt(optional('CONSOLIDATOR_INTERVAL_MIN', '15'), 10),
  PRICING_INTERVAL_HOURS: parseInt(optional('PRICING_INTERVAL_HOURS', '2'), 10),
  LISTING_INTERVAL_MIN: parseInt(optional('LISTING_INTERVAL_MIN', '30'), 10),
  CROSS_DELIST_INTERVAL_MIN: parseInt(optional('CROSS_DELIST_INTERVAL_MIN', '15'), 10),

  // Fail-Safes
  MAX_CRASH_LOOPS: parseInt(optional('MAX_CRASH_LOOPS', '3'), 10),
  MAX_RETRIES_PER_PHOTO: parseInt(optional('MAX_RETRIES_PER_PHOTO', '3'), 10),
  DAILY_OPENAI_BUDGET_USD: parseFloat(optional('DAILY_OPENAI_BUDGET_USD', '5.00'))
};
