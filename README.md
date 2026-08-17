# Bodenova Books Worker — Railway Service

**Zweck:** Ersetzt die n8n-Bücher-Pipeline. Läuft als Railway-Service, keine Executions-Kosten.

**Dimension:** 3.000 Bücher, 15.000 Fotos in Google Drive → Airtable → 4-6 Verkaufsplattformen

## Warum Railway statt n8n

| | n8n | Railway |
|---|---|---|
| Kosten bei 15k Fotos | ~90k Executions × Plan → 100€+/Monat | Fixe Server-Miete ~5€/Monat |
| Memory-Limit | ~500MB pro Execution | Skalierbar (Node-Prozess) |
| Debug | Silent Crashes | Volle Console + Logs |
| Batch-Größe | Max 5 wegen Memory | Beliebig (Streaming möglich) |
| Retry-Logik | Muss man selbst bauen | Built-in Queue-System möglich |
| Kontrolle | GUI-Klicks | Git-Version-Control |

## Architektur

```
Google Drive Bücher-Ordner (15k Fotos)
        ↓
[Vision-Worker] — läuft alle 5 Min als Cron
  • Holt max 20 unverarbeitete Fotos (Streaming, kein Memory-Overflow)
  • OpenAI Vision (gpt-4o-mini) mit detail: 'low' — reicht für Titel
  • Retry mit Exponential Backoff
  • Fehler → Log, kein Crash
        ↓
Airtable Photo_Queue (Rohdaten pro Foto)
        ↓
[Consolidator-Worker] — läuft alle 15 Min
  • Cover-basierte Buch-Gruppierung
  • Erzeugt/updated Inventory Items Records
  • Fuzzy-Matching für Umlaut-Duplikate (Mußestunden = Mussestunden)
        ↓
Airtable Inventory Items (Category=Book)
        ↓
[Pricing-Worker] — läuft alle 2h
  • Booklooker + eBay Marktrecherche pro ISBN
  • Setzt Price_Booklooker, Price_eBay, Approved_for_Listing
  • Airtable-native AI-Felder machen Titel + Beschreibung
        ↓
[Listing-Worker] — läuft alle 30 Min für Ready-to-List
  • Booklooker: API-Upload
  • AbeBooks: HomeBase-CSV per Mail
  • eBay: Trading API
  • Salvante: Supabase-Direktzugriff
        ↓
[Cross-Delist-Worker] — läuft alle 15 Min
  • Prüft alle 4 Plattformen auf Sold-Status
  • Bei Verkauf: sofort auf anderen 3 delisten
```

## Struktur

```
bodenova-books-worker/
├── README.md
├── package.json
├── railway.json               (Deploy-Config)
├── .env.example               (alle nötigen Vars dokumentiert)
├── src/
│   ├── server.js              (Express + Health-Check)
│   ├── config.js              (Env-Vars laden)
│   ├── clients/
│   │   ├── airtable.js        (Airtable-Wrapper + Rate-Limit)
│   │   ├── drive.js           (Google Drive OAuth + File-Download)
│   │   ├── openai.js          (Vision-Call mit Retry)
│   │   ├── booklooker.js      (Booklooker-API)
│   │   ├── abebooks.js        (AbeBooks HomeBase CSV Builder)
│   │   ├── ebay.js            (eBay Trading API)
│   │   └── salvante.js        (Supabase Client)
│   ├── workers/
│   │   ├── vision-worker.js
│   │   ├── consolidator.js
│   │   ├── pricing.js
│   │   ├── listing.js
│   │   └── cross-delist.js
│   ├── utils/
│   │   ├── logger.js          (strukturiertes Logging)
│   │   ├── retry.js           (Exponential-Backoff)
│   │   ├── fuzzy-hash.js      (Umlaut-Normalisierung)
│   │   └── cover-grouping.js  (Cover-basierte Book-Erkennung)
│   └── routes/
│       ├── health.js
│       ├── trigger.js         (Manuelle Trigger via HTTP)
│       └── stats.js           (Dashboard-Endpoint)
├── scripts/
│   ├── import-all-drive-photos.js   (One-shot: alle 15k Fotos → Airtable)
│   ├── deduplicate.js               (Fuzzy-Merge einmalig)
│   └── test-single-photo.js         (Debug-Test mit einem Foto)
└── docs/
    ├── ARCHITEKTUR.md
    ├── BUGS-BEKANNT.md
    ├── DEPLOYMENT.md
    └── AIRTABLE-SCHEMA.md
```

## Kritische Prinzipien (aus Fehler-Learnings)

### 1. Test-vor-Deploy
Jeder Worker hat einen `--dry-run` Modus der 1 Foto nimmt und Ergebnis ausgibt ohne DB-Write.

### 2. Read-after-Write
Nach jedem Airtable-UPDATE wird sofort ein GET gemacht und verifiziert. Silent Failures werden geloggt und alarmiert.

### 3. Impact-Rechnung
Vor jedem Cron: Kosten-Kalkulator berechnet OpenAI + Airtable-API-Calls. Wenn > Budget → Warning.

### 4. Crash-Loop Fail-Safe
Wenn 3× hintereinander gleicher Fehler: Worker pausiert sich selbst und schickt Slack-Alert.

### 5. Sunk-Cost-Detection
Wenn ein Vorgang 3× fehlschlägt (z.B. OpenAI-Error für gleiches Foto): Foto wird als `Status = Manual_Review` markiert, nicht endlos retried.

## Deployment

Siehe `docs/DEPLOYMENT.md` — Kurz:
1. Repo auf GitHub anlegen: `boderaffa1-sudo/bodenova-books-worker`
2. Railway → New Project → Deploy from GitHub → Repo wählen
3. Environment Variables setzen (siehe `.env.example`)
4. Auto-Deploy on `main` push
5. Cron-Trigger via Railway Cron (5 Min Vision, 15 Min Consolidator, etc.)

## Kosten-Schätzung 15.000 Fotos

| Posten | Kosten |
|---|---|
| Railway Server (Hobby-Plan) | 5€/Monat |
| OpenAI Vision (15k Fotos × $0.0002) | ~3€ einmalig |
| Airtable API-Calls (unter Free-Limit 100k/Monat) | 0€ |
| Booklooker API | im Plan enthalten |
| **Total** | **~8€ einmalig + 5€/Monat** |

Statt bei n8n bei 90k Executions in ein 100€/Mo-Plan zu kommen.
