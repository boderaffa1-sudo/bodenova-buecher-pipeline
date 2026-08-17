// ═══════════════════════════════════════════════════════════════════
// consolidator.js — Photo_Queue → Inventory Items (Books)
// ═══════════════════════════════════════════════════════════════════
// Nimmt alle nicht-konsolidierten Fotos, gruppiert sie Cover-basiert
// und erzeugt/updated Inventory Items.

const { logger } = require('../utils/logger');
const airtable = require('../clients/airtable');
const { groupPhotosByBook } = require('../utils/cover-grouping');

async function runConsolidator() {
  logger.info('Consolidator start');

  const photos = await airtable.listUnconsolidatedPhotos(500);
  logger.info({ count: photos.length }, 'Unconsolidated photos');

  if (photos.length === 0) {
    return { books_created: 0, books_updated: 0 };
  }

  // Cover-basierte Gruppierung
  const bookGroups = groupPhotosByBook(photos.map(p => ({
    id: p.id,
    fields: p.fields
  })));

  logger.info({ groups: bookGroups.length }, 'Book groups detected');

  let booksCreated = 0;
  let booksUpdated = 0;

  for (const group of bookGroups) {
    // Prüfe ob Buch mit gleichem Hash schon existiert
    const existing = await airtable.findBookByHash(group.hash);

    const bookFields = {
      Name: group.titel,
      Category: 'Book',
      Status: 'New',
      Author: group.autor,
      Publisher: group.verlag,
      Publication_Year: group.jahr,
      ISBN: group.isbn,
      Language: mapLanguage(group.sprache),
      Book_Condition: mapCondition(group.zustand),
      First_Edition: group.erstausgabe,
      Signed: group.signiert,
      Vergilbung_Grad: group.vergilbung_grad,
      Consolidated: true,
      Consolidated_Title_DE: group.titel,
      Photo_Count: group.photos.length,
      // Grouping_Hash (falls Feld existiert)
      // Grouping_Hash: group.hash
    };

    if (existing) {
      await airtable.updateInventoryRecord(existing.id, bookFields);
      booksUpdated++;
      logger.info({ recordId: existing.id, titel: group.titel }, 'Book updated');
    } else {
      const created = await airtable.createInventoryBook(bookFields);
      booksCreated++;
      logger.info({ recordId: created.id, titel: group.titel }, 'Book created');
    }

    // Photo_Queue Records als konsolidiert markieren
    for (const photo of group.photos) {
      await airtable.photoQueue.update([{
        id: photo.id,
        fields: { Consolidated: true, Book_Hash: group.hash }
      }]);
    }
  }

  logger.info({ booksCreated, booksUpdated }, 'Consolidator done');
  return { books_created: booksCreated, books_updated: booksUpdated };
}

function mapLanguage(lang) {
  const map = { de: 'German', en: 'English', fr: 'French' };
  return map[lang] || 'Other';
}

function mapCondition(cond) {
  const map = {
    wie_neu: 'Like New',
    sehr_gut: 'Very Good',
    gut: 'Good',
    akzeptabel: 'Acceptable',
    schlecht: 'Poor'
  };
  return map[cond] || null;
}

module.exports = { runConsolidator };

if (require.main === module) {
  runConsolidator()
    .then(r => { logger.info({ r }, 'Done'); process.exit(0); })
    .catch(e => { logger.error({ e }, 'Failed'); process.exit(1); });
}
