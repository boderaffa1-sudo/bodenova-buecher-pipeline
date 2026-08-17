// ═══════════════════════════════════════════════════════════════════
// drive.js — Google Drive Client mit Service-Account-Auth
// ═══════════════════════════════════════════════════════════════════
// Nutzt Service-Account statt OAuth-User (kein Token-Refresh nötig).
// Vor Deployment: Service-Account erstellen, JSON runterladen,
// base64-encoden und als GOOGLE_SERVICE_ACCOUNT_JSON_B64 in Railway setzen.
// Dann: Service-Account Email zum Drive-Ordner Zugang geben.

const { google } = require('googleapis');
const config = require('../config');
const { logger } = require('../utils/logger');

let driveClient = null;

function getClient() {
  if (driveClient) return driveClient;
  
  const jsonB64 = config.GOOGLE_SERVICE_ACCOUNT_JSON_B64;
  if (!jsonB64) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON_B64 not set');
  }
  
  const credentials = JSON.parse(Buffer.from(jsonB64, 'base64').toString('utf-8'));
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly']
  });
  
  driveClient = google.drive({ version: 'v3', auth });
  return driveClient;
}

async function listImages(folderId) {
  const drive = getClient();
  const allFiles = [];
  let pageToken = null;
  
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and mimeType contains 'image' and trashed=false`,
      fields: 'nextPageToken, files(id, name, createdTime, mimeType, size)',
      pageSize: 1000,
      pageToken,
      orderBy: 'name'
    });
    
    allFiles.push(...(res.data.files || []));
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  
  logger.info({ folderId, count: allFiles.length }, 'Drive files listed');
  return allFiles;
}

async function downloadFile(fileId) {
  const drive = getClient();
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  return Buffer.from(res.data);
}

async function makePublic(fileId) {
  const drive = getClient();
  await drive.permissions.create({
    fileId,
    requestBody: { role: 'reader', type: 'anyone' }
  });
  return `https://drive.google.com/uc?export=view&id=${fileId}`;
}

module.exports = { listImages, downloadFile, makePublic };
