// ═══════════════════════════════════════════════════════════════════
// cover-grouping.js — Cover-basierte Buch-Gruppierung
// ═══════════════════════════════════════════════════════════════════
// User-Insight: "Cover = neues Buch. Alles bis zum nächsten Cover
// gehört zum aktuellen Buch (Impressum, Rückseite, Innenseiten)."
//
// Zusatz-Logik:
// - "mehrere_buchruecken" wird als eigene Gruppe behandelt (Regal-Foto)
// - "unbekannt" ohne Cover-Vorgänger wird als "waise" markiert
// - Time-Fallback: wenn zwischen Cover und Folge-Foto >5 Min, neuer Start

function groupPhotosByBook(photos) {
  // Sortiere chronologisch nach Foto_Zeit
  photos.sort((a, b) => {
    const ta = a.fields.Foto_Zeit || a.fields.Created_At || '';
    const tb = b.fields.Foto_Zeit || b.fields.Created_At || '';
    return String(ta).localeCompare(String(tb));
  });

  const groups = [];
  let currentBook = null;
  const COVER_TYPES = new Set(['cover_modern', 'cover_antik']);
  const TITEL_TYPES = new Set(['cover_modern', 'cover_antik', 'titelseite_innen']);
  const MAX_GAP_MS = 5 * 60 * 1000; // 5 Minuten

  for (const photo of photos) {
    const f = photo.fields;
    const objType = (f.AI_Objekttyp || f.AI_Object_Type || 'unbekannt').toLowerCase();
    const titel = (f.Titel || '').trim();
    const photoTime = new Date(f.Foto_Zeit || f.Created_At || 0).getTime();

    // Regal-Foto (mehrere Bücher): eigene Gruppe
    if (objType === 'mehrere_buchruecken') {
      groups.push({
        book_id: `SHELF_${photo.id}`,
        hash: 'shelf_' + photo.id,
        titel: 'Bücher-Regal-Foto',
        autor: null,
        verlag: null,
        jahr: null,
        isbn: null,
        sprache: null,
        zustand: 'unbekannt',
        antiquarisch: false,
        erstausgabe: false,
        signiert: false,
        vergilbung_grad: null,
        photos: [{ id: photo.id, filename: f.GDrive_Filename }],
        is_shelf: true
      });
      // Regal-Foto beendet auch das aktuelle Buch (falls existiert)
      if (currentBook) {
        groups.push(currentBook);
        currentBook = null;
      }
      continue;
    }

    // Neues Buch beginnt: Cover ODER Titelseite (wenn kein aktives Buch)
    const startsNewBook = COVER_TYPES.has(objType) || 
                         (objType === 'titelseite_innen' && (!currentBook || currentBook.has_cover));
    
    // Time-Fallback: großer Gap → neues Buch trotz fehlendem Cover
    const bigGap = currentBook && currentBook.lastPhotoTime && 
                   (photoTime - currentBook.lastPhotoTime > MAX_GAP_MS);

    if (startsNewBook && titel) {
      if (currentBook) groups.push(currentBook);
      currentBook = createBookFromPhoto(photo, objType);
    } else if (bigGap && titel) {
      if (currentBook) groups.push(currentBook);
      currentBook = createBookFromPhoto(photo, objType);
    } else if (!currentBook) {
      // Waisenkind (Impressum ohne vorheriges Cover): eigene Gruppe wenn Titel
      if (titel) {
        currentBook = createBookFromPhoto(photo, objType);
      }
      // Sonst überspringen (kein Titel, kein Buch)
    } else {
      // Photo dem aktuellen Buch anhängen
      addPhotoToBook(currentBook, photo);
    }

    if (currentBook) {
      currentBook.lastPhotoTime = photoTime;
    }
  }

  // Letztes Buch pushen
  if (currentBook) groups.push(currentBook);

  return groups;
}

function createBookFromPhoto(photo, objType) {
  const f = photo.fields;
  const titel = (f.Titel || '').trim();
  const band = f.Band || null;
  const COVER_TYPES = new Set(['cover_modern', 'cover_antik']);

  return {
    book_id: `B${Date.now()}_${photo.id.substring(3, 8)}`,
    hash: makeGroupingHash(titel, band),
    titel: titel,
    autor: f.Autor || null,
    band: band,
    reihe: f.Reihe || null,
    verlag: f.Verlag || null,
    jahr: f.Jahr || null,
    isbn: f.ISBN || null,
    sprache: f.Sprache || null,
    kategorie: f.Kategorie || null,
    zustand: f.AI_Zustand || 'unbekannt',
    antiquarisch: !!f.Antiquarisch,
    erstausgabe: !!f.Erstausgabe,
    signiert: !!f.Signiert,
    vergilbung_grad: f.Vergilbung_Grad || null,
    has_cover: COVER_TYPES.has(objType),
    photos: [{ id: photo.id, filename: f.GDrive_Filename }]
  };
}

function addPhotoToBook(book, photo) {
  const f = photo.fields;
  book.photos.push({ id: photo.id, filename: f.GDrive_Filename });

  // Falls dieses Foto besseren Info hat als das Buch, upgraden
  if (!book.autor && f.Autor) book.autor = f.Autor;
  if (!book.verlag && f.Verlag) book.verlag = f.Verlag;
  if (!book.jahr && f.Jahr) book.jahr = f.Jahr;
  if (!book.isbn && f.ISBN) book.isbn = f.ISBN;
  if (!book.zustand || book.zustand === 'unbekannt') {
    if (f.AI_Zustand && f.AI_Zustand !== 'unbekannt') book.zustand = f.AI_Zustand;
  }
  if (f.Antiquarisch) book.antiquarisch = true;
  if (f.Erstausgabe) book.erstausgabe = true;
  if (f.Signiert) book.signiert = true;
}

function makeGroupingHash(titel, band) {
  if (!titel) return 'unbekannt_' + Date.now();
  const clean = titel.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '')
    .substring(0, 35);
  return clean + (band ? `_band${band}` : '');
}

module.exports = { groupPhotosByBook, makeGroupingHash };
