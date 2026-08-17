# Deploy-Checkliste (aus Kimi-Review)

Diese Reihenfolge strikt einhalten:

## Phase 1: Pre-Deploy

- [ ] Google Service-Account erstellt und JSON heruntergeladen
- [ ] Service-Account als Betrachter zum Drive-Bücher-Ordner hinzugefügt
- [ ] JSON base64-encoded (siehe `docs/DEPLOYMENT.md`)
- [ ] Airtable Personal Access Token generiert (mit Scope für Books-Base)
- [ ] Resend-Domain `bodenova.de` verifiziert (DNS-Records eingetragen)
  - Wenn nicht: `FROM_EMAIL=onboarding@resend.dev` als Fallback
- [ ] `.env.example` kopiert und für lokalen Test angepasst

## Phase 2: Code-Review

- [ ] `src/server.js` liest `process.env.PORT` (nicht hardcoded) ✓
- [ ] `.gitignore` enthält `.env`, `*.pem`, `service-account*.json` ✓
- [ ] Keine API-Keys im Code (nur `process.env.XXX`) ✓
- [ ] `helmet`, `cors`, `express-rate-limit` in package.json ✓
- [ ] Health-Check erweitert (nicht nur ok, sondern services{}) ✓
- [ ] Env-Var-Validation beim Start (Fail-fast) ✓
- [ ] Structured Logging via Pino ✓
- [ ] Crash-Loop-Detection eingebaut ✓
- [ ] Read-after-Write in Airtable-Client ✓

## Phase 3: GitHub

- [ ] Repo `boderaffa1-sudo/bodenova-books-worker` erstellt (PRIVATE)
- [ ] Alle Files committed (KEIN `.env` im Commit!)
- [ ] `git push origin main`
- [ ] GitHub-Actions (optional) für Lint/Test

## Phase 4: Railway-Deploy

- [ ] Railway-Projekt angelegt (via CLI oder Web)
- [ ] GitHub-Repo verknüpft (Auto-Deploy on main)
- [ ] Alle **kritischen** Env-Vars im Dashboard eingetragen:
  - [ ] `AIRTABLE_PAT`
  - [ ] `AIRTABLE_BASE_ID`
  - [ ] `GOOGLE_DRIVE_FOLDER_ID`
  - [ ] `GOOGLE_SERVICE_ACCOUNT_JSON_B64`
  - [ ] `OPENAI_API_KEY`
  - [ ] `TRIGGER_TOKEN` (zufälliger String für /trigger)
  - [ ] `NODE_ENV=production`
- [ ] Optionale Env-Vars nach Bedarf:
  - [ ] `BOOKLOOKER_API_KEY`
  - [ ] `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_REFRESH_TOKEN`
  - [ ] `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
  - [ ] `RESEND_API_KEY`, `FROM_EMAIL`, `NOTIFY_EMAIL`
  - [ ] `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
- [ ] `FRONTEND_URL` gesetzt falls Dashboard separat läuft

## Phase 5: Verifikation

- [ ] `curl https://<railway-url>/health` → status: ok
- [ ] Services zeigen `connected` (nicht `missing`) für Airtable, Drive, OpenAI
- [ ] Deploy-Logs zeigen: `🚀 Bodenova Books Worker started`
- [ ] Cron-Registration in Logs: `Cron workers registered`

## Phase 6: Erst-Test (SICHER, kein Batch-Run)

- [ ] Ein einzelnes Test-Foto verifizieren:
  ```bash
  # Lokal
  export GOOGLE_SERVICE_ACCOUNT_JSON_B64=...
  export OPENAI_API_KEY=...
  npm run script:test-photo 1_uUzVPW04EBhAO4zrFeJdvFxM19V2u7M
  ```
  Erwartet: JSON mit objekttyp, titel, autor etc.

- [ ] Wenn Test-Foto erfolgreich → Vision-Worker manuell auf Railway triggern:
  ```bash
  curl -X POST \
    -H "X-Trigger-Token: $TRIGGER_TOKEN" \
    https://<railway-url>/trigger/vision
  ```

- [ ] `/stats` prüfen: `photo_queue.buecher_verarbeitet` gestiegen?

## Phase 7: Massen-Import (nach erfolgreichem Test)

- [ ] Cron aktivieren (läuft automatisch alle 5 Min in Production)
- [ ] `/stats` alle 30 Min prüfen — sollte kontinuierlich wachsen
- [ ] Nach 24h: 5760+ Fotos verarbeitet (bei 15k Fotos in ~3 Tagen durch)
- [ ] OpenAI-Usage-Dashboard prüfen: sind wir unter $5/Tag Budget?

## Phase 8: Listing (nach Consolidator lief)

- [ ] Airtable öffnen: sind `Inventory Items` mit `Category=Book` da?
- [ ] Manuell 1-2 Bücher als `Approved_for_Listing=true` markieren
- [ ] Pricing-Worker triggern:
  ```bash
  curl -X POST -H "X-Trigger-Token: $TRIGGER_TOKEN" https://<url>/trigger/pricing
  ```
- [ ] Preise gesetzt? Wenn ja: Listing-Worker triggern
- [ ] Auf Booklooker/AbeBooks Verkäufer-Account prüfen: Listing sichtbar?

## Phase 9: Monitoring aufsetzen

- [ ] Telegram-Bot erstellen (via @BotFather)
- [ ] `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` in Railway setzen
- [ ] Test-Alert: Worker manuell pausieren, prüfen ob Telegram-Nachricht kommt
- [ ] Uptime-Monitoring (z.B. Better Stack, kostenlos) auf `/health` einrichten

## Rot-Alerte (STOPP wenn:)

- ❌ Health-Check zeigt `missing` bei kritischem Service → Env-Var fehlt
- ❌ Vision-Worker crasht 3× hintereinander → Worker pausiert, Telegram-Alert
- ❌ OpenAI-Usage > $5/Tag → Budget-Alert (in `config.js` `DAILY_OPENAI_BUDGET_USD`)
- ❌ Airtable API 429 (rate-limit) → `p-limit` in Client reduzieren
- ❌ Railway-Server crasht dauerhaft → `railway logs` prüfen + rollback
