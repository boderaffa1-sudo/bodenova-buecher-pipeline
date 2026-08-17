// ═══════════════════════════════════════════════════════════════════
// openai.js — OpenAI Vision Client für Buch-Foto-Analyse
// ═══════════════════════════════════════════════════════════════════

const OpenAI = require('openai');
const config = require('../config');
const { logger } = require('../utils/logger');

const client = new OpenAI({ apiKey: config.OPENAI_API_KEY });

const SYSTEM_PROMPT = `Du bist Experte für Buch-Foto-Analyse. Analysiere ein Foto und liefere strukturierte Daten als JSON.`;

const USER_PROMPT = `Analysiere dieses Buch-Foto. Antworte STRIKT als JSON mit folgenden Feldern:

- objekttyp: cover_modern | cover_antik | titelseite_innen | rueckseite | impressum | innenseite | buchruecken | mehrere_buchruecken | unbekannt
- anzahl_buchruecken: Zahl (nur bei mehrere_buchruecken)
- alle_buecher: Array von {titel, band, verlag} PRO SICHTBAREM BUCHRÜCKEN (nur bei mehrere_buchruecken)
- titel: Haupt-Titel (Cover oder erster erkennbarer)
- autor
- band: Zahl, nur wenn eindeutig
- reihe
- verlag
- jahr: Zahl (nur wenn eindeutig, z.B. auf Impressum)
- isbn
- sprache: de/en/fr/es/it/unknown
- kategorie: Wissenschaft/Philosophie/Belletristik/Sachbuch/Kunst/Kochbuch/Kinderbuch/Reisefuehrer/Woerterbuch/Ratgeber/Sonstiges/unbekannt
- zustand: wie_neu | sehr_gut | gut | akzeptabel | schlecht | unbekannt
- vergilbung: keine | leicht | mittel | stark
- vergilbung_grad: 1-5 (1=weiss, 5=stark gelb)
- antiquarisch: boolean (true wenn Buch klar vor 1930 aussieht — Ledereinband, Fraktur, Goldschnitt, Handbindung)
- erstausgabe: boolean
- signiert: boolean
- markierungen: keine/bleistift/kugelschreiber/textmarker/stempel

REGELN:
1. Buchrücken (nur Rücken sichtbar, Titel klein/schwer lesbar): objekttyp='buchruecken'
2. Mehrere Bücher aufgereiht (Buchrücken-Reihe): objekttyp='mehrere_buchruecken', fülle alle_buecher
3. Cover mit vollem Titel: 'cover_modern' oder 'cover_antik' (antik = klar vor 1930)
4. Nur Titelseite aufgeschlagen: 'titelseite_innen'
5. Wenn NICHTS lesbar: objekttyp='unbekannt' und lasse alle Textfelder leer
6. Bei Bänden: Band-Nummer aus Titel oder Buchrücken auslesen ("Band 1", "Bd. 3", "Vol. 2")`;

async function analyzeBookPhoto(base64Image, filename) {
  const startTime = Date.now();
  
  try {
    const response = await client.chat.completions.create({
      model: config.OPENAI_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: USER_PROMPT },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
                detail: config.OPENAI_VISION_DETAIL
              }
            }
          ]
        }
      ],
      response_format: { type: 'json_object' },
      max_tokens: 800,
      temperature: 0.1
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI returned empty content');
    }

    const parsed = JSON.parse(content);
    const duration = Date.now() - startTime;
    
    logger.debug({
      filename,
      objekttyp: parsed.objekttyp,
      titel: parsed.titel,
      tokens: response.usage?.total_tokens,
      durationMs: duration
    }, 'Vision analysis complete');

    return parsed;
  } catch (err) {
    logger.error({ filename, err: err.message }, 'Vision analysis failed');
    throw err;
  }
}

// Für Test/Debug: nur Kosten schätzen
function estimateCost(numPhotos) {
  // gpt-4o-mini bei detail=low: ~$0.0002 pro Foto
  const perPhoto = config.OPENAI_VISION_DETAIL === 'high' ? 0.001 : 0.0002;
  return numPhotos * perPhoto;
}

module.exports = { analyzeBookPhoto, estimateCost };
