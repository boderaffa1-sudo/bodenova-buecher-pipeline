# Deployment Guide — Bodenova Books Worker auf Railway

## Voraussetzungen

- [ ] GitHub-Account (`boderaffa1-sudo` — vorhanden)
- [ ] Railway-Account (kostenlos anlegen unter [railway.com](https://railway.com))
- [ ] Google Cloud Service-Account (Anleitung unten)
- [ ] Airtable Personal Access Token (vorhanden)
- [ ] OpenAI API Key (vorhanden)

---

## 1. Google Service-Account anlegen (einmalig)

Warum: Der Worker läuft ohne User-Interaktion. OAuth mit User-Token bräuchte alle 60 Min Refresh — Service-Account nicht.

**Schritte:**

1. Gehe zu [console.cloud.google.com](https://console.cloud.google.com)
2. Projekt anlegen: `bodenova-books`
3. APIs aktivieren:
   - Google Drive API
4. Service-Account anlegen:
   - IAM & Admin → Service Accounts → Create Service Account
   - Name: `bodenova-books-worker`
   - Role: (keine — kommt gleich)
5. Key erstellen:
   - Auf den Service-Account klicken → Keys → Add Key → Create → JSON
   - Datei speichern: `service-account.json` (⚠️ NIEMALS ins Repo!)
6. Base64-encoden:
   ```bash
   base64 -w0 service-account.json > service-account-b64.txt
   ```
7. Drive-Ordner Zugang geben:
   - Google Drive → Bücher-Ordner öffnen
   - Rechtsklick → Freigeben
   - Service-Account-Email einfügen (steht in JSON als `client_email`)
   - Berechtigung: **Betrachter** (readonly reicht!)

---

## 2. Repo auf GitHub anlegen

```bash
# Im lokalen Projekt-Ordner
cd bodenova-books-worker
git init
git add .
git commit -m "Initial commit: Books Worker structure"
gh repo create boderaffa1-sudo/bodenova-books-worker --private --source=. --remote=origin --push
```

---

## 3. Railway-Deployment

### Deploy-Command:

```bash
# Via Railway CLI (installieren: npm i -g @railway/cli)
railway login
railway link                    # Neues Projekt anlegen oder verknüpfen
railway up                       # Erstes Deploy
```

**ODER** via Web-UI:
1. [railway.com/new](https://railway.com/new)
2. Deploy from GitHub Repo → `bodenova-books-worker` auswählen
3. Auto-Deploy on `main` push ✅

---

## 4. Environment-Variablen setzen (Railway Dashboard)

**KRITISCH: Diese müssen im Railway-Dashboard eingetragen werden, NIEMALS im Repo!**

Railway → Project → Variables:

### Pflicht (Worker crasht sonst beim Start):
```
AIRTABLE_PAT=patAf...
AIRTABLE_BASE_ID=appWh8CQNQbpI1tLJ
GOOGLE_DRIVE_FOLDER_ID=1Oq9I55IinW-Q1AAekcnDfvwAt_IIf8Rd
GOOGLE_SERVICE_ACCOUNT_JSON_B64=<Inhalt von service-account-b64.txt>
OPENAI_API_KEY=sk-...
TRIGGER_TOKEN=<generiere zufälligen String, für manuelle Trigger>
```

### Optional (Feature-Flags):
```
BOOKLOOKER_API_KEY=...
ABEBOOKS_BOOKSELLER_ID=89785814
EBAY_CLIENT_ID=...
EBAY_CLIENT_SECRET=...
EBAY_REFRESH_TOKEN=...
SUPABASE_URL=https://ztnkvtagnefygvixshqu.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
RESEND_API_KEY=...
NOTIFY_EMAIL=bode@bodenova.de
FROM_EMAIL=Bodenova <noreply@bodenova.de>
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
```

### Worker-Konfiguration (empfohlene Defaults):
```
VISION_BATCH_SIZE=20
VISION_CONCURRENCY=5
MAX_CRASH_LOOPS=3
MAX_RETRIES_PER_PHOTO=3
DAILY_OPENAI_BUDGET_USD=5.00
NODE_ENV=production
```

---

## 5. Health-Check

Nach Deploy:
```bash
curl https://<railway-url>/health
```

Antwort sollte so aussehen:
```json
{
  "status": "ok",
  "service": "bodenova-books-worker",
  "services": {
    "airtable": "connected",
    "google_drive": "connected",
    "openai": "connected",
    "booklooker": "optional"
  },
  "workers": { ... }
}
```

Wenn `"missing"` bei kritischen Services steht → Env-Var fehlt in Railway.

---

## 6. Erst-Test (WICHTIG!)

Bevor der Cron alle 5 Min läuft, ein einzelnes Foto testen:

```bash
# Vision-Worker manuell mit Batch-Size 1
curl -X POST \
  -H "X-Trigger-Token: $TRIGGER_TOKEN" \
  https://<railway-url>/trigger/vision
```

Danach `/stats` prüfen:
```bash
curl https://<railway-url>/stats
```

Wenn `photo_queue.buecher_verarbeitet` gestiegen ist → funktioniert.

---

## 7. Domain-Verifizierung Resend

**Nur relevant wenn `RESEND_API_KEY` gesetzt ist!**

Ohne verifizierte Domain landen Mails im Spam oder werden blockiert.

1. Login [resend.com](https://resend.com)
2. Domains → Add Domain → `bodenova.de`
3. DNS-Records bei Cloudflare eintragen (Resend zeigt die Records)
4. Verifizieren
5. Erst dann `FROM_EMAIL=Bodenova <noreply@bodenova.de>` nutzen

**Bis Domain verifiziert ist:** `FROM_EMAIL=onboarding@resend.dev` als Fallback.

---

## 8. Monitoring

Railway zeigt:
- CPU + Memory-Verbrauch
- Deploy-Logs
- Live-Logs (via `railway logs`)

Structured Logs im Pino-Format — filterbar via:
```bash
railway logs | grep '"worker":"vision"'
```

---

## 9. Rollback

Bei Bugs:
```bash
railway rollback           # Vorherige Version deployen
```

Oder in der Web-UI: Deployments → alte Version → Redeploy.

---

## 10. Kosten-Erwartung

Railway Hobby-Plan:
- **5€/Monat** Basis
- Bei Bücher-Worker (~1 vCPU, 512 MB RAM, immer an): ca. **5-8€/Monat**

Erste 15.000 Fotos einmalig importieren:
- OpenAI: ~3€ einmalig (15k × $0.0002)
- Airtable: kostenlos unter 100k API-Calls/Monat

Laufend:
- ~5€/Mo Railway
- OpenAI on-demand für neue Fotos

**Vergleich n8n:** Bei gleichem Volumen wärst du bei ~50-100€/Monat wegen Executions-Limit.
