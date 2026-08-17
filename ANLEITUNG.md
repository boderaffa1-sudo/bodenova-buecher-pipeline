# Bodenova Books Worker — Deploy-Anleitung Schritt für Schritt

**So arbeitest du das ab:** Von oben nach unten. Jeder Schritt kann ~5-15 Min dauern. Wenn ein Schritt failed → STOPP und melden, nicht weitermachen.

**Gesamtzeit:** ~90 Minuten wenn alles glatt läuft.

---

## PHASE 0 — Vorbereitung (5 Min)

### 0.1 ZIP entpacken

Du hast die ZIP `bodenova-books-worker.zip` bekommen. Entpacke sie irgendwo lokal, z.B.:

```bash
cd ~/Downloads
unzip bodenova-books-worker.zip
cd bodenova-books-worker
```

- [ ] ZIP entpackt
- [ ] Ordner-Struktur ist da (README.md, src/, docs/, package.json)

---

## PHASE 1 — Google Service-Account erstellen (15 Min)

**Warum:** Damit der Railway-Worker ohne User-Login auf deinen Google Drive Bücher-Ordner zugreifen kann.

### 1.1 Google Cloud Console

1. Öffne [console.cloud.google.com](https://console.cloud.google.com)
2. Login mit dem Google-Account der auch Zugriff auf den Bücher-Ordner hat
3. Oben Projekt-Dropdown → **"Neues Projekt"**
4. Name: `bodenova-books`
5. Erstellen klicken → warten bis fertig
6. Sicherstellen dass oben das neue Projekt ausgewählt ist

- [ ] Projekt `bodenova-books` erstellt

### 1.2 Google Drive API aktivieren

1. Links Menü → **"APIs & Dienste"** → **"Bibliothek"**
2. Suchen: `Google Drive API`
3. Klicken → **"Aktivieren"**

- [ ] Google Drive API aktiviert

### 1.3 Service-Account anlegen

1. Links Menü → **"IAM & Verwaltung"** → **"Dienstkonten"**
2. Oben **"+ Dienstkonto erstellen"**
3. Name: `bodenova-books-worker`
4. Beschreibung: `Railway Worker für Bücher-Pipeline`
5. **"Erstellen und fortfahren"**
6. Rolle-Schritt einfach überspringen → **"Weiter"** → **"Fertig"**

- [ ] Service-Account erstellt

### 1.4 Key erstellen und JSON runterladen

1. In der Dienstkonto-Liste den neuen `bodenova-books-worker` anklicken
2. Tab **"Schlüssel"**
3. **"Schlüssel hinzufügen"** → **"Neuen Schlüssel erstellen"**
4. Typ: **JSON** → **"Erstellen"**
5. Datei wird automatisch runtergeladen — z.B. `bodenova-books-abc123.json`
6. **WICHTIG:** Diese Datei NIEMALS in ein Git-Repo committen!

- [ ] JSON-Key heruntergeladen
- [ ] JSON-Datei in sicheren Ordner verschoben (z.B. `~/Documents/keys/`)

### 1.5 Service-Account Email kopieren

Öffne die JSON-Datei mit Text-Editor. Da steht drin:

```json
{
  "client_email": "bodenova-books-worker@bodenova-books.iam.gserviceaccount.com",
  ...
}
```

Die `client_email` kopieren — die brauchst du gleich.

- [ ] Service-Account-Email kopiert

### 1.6 Drive-Zugriff für Service-Account

1. Google Drive öffnen: [drive.google.com](https://drive.google.com)
2. Zum Bücher-Ordner navigieren (der mit den 15.000 Fotos)
3. Rechtsklick → **"Freigeben"**
4. Die Service-Account-Email einfügen
5. Berechtigung: **"Betrachter"** (readonly reicht!)
6. Häkchen bei "Personen benachrichtigen" ENTFERNEN
7. **"Freigeben"** klicken

- [ ] Bücher-Ordner mit Service-Account geteilt (nur Betrachter)

### 1.7 JSON in Base64 umwandeln

**Auf Mac/Linux:**
```bash
base64 -w0 ~/Documents/keys/bodenova-books-abc123.json > ~/Documents/keys/service-account-b64.txt
cat ~/Documents/keys/service-account-b64.txt | head -c 100
```

**Auf Windows (PowerShell):**
```powershell
$content = Get-Content -Path "C:\Users\DEIN_NAME\Documents\keys\bodenova-books-abc123.json" -Raw
$bytes = [System.Text.Encoding]::UTF8.GetBytes($content)
$b64 = [Convert]::ToBase64String($bytes)
$b64 | Out-File -FilePath "C:\Users\DEIN_NAME\Documents\keys\service-account-b64.txt" -NoNewline
```

Der Base64-String ist EINE LANGE Zeile — kein Zeilenumbruch! Falls doch Zeilenumbrüche drin sind, mit einem Editor entfernen.

- [ ] Base64-String erzeugt (in `service-account-b64.txt`)
- [ ] Ist wirklich EINE Zeile ohne Umbrüche

---

## PHASE 2 — GitHub-Repo erstellen (5 Min)

### 2.1 Repo auf GitHub anlegen

1. [github.com/new](https://github.com/new)
2. Owner: `boderaffa1-sudo`
3. Name: `bodenova-books-worker`
4. **PRIVATE** (nicht Public!)
5. NICHT initialisieren mit README/gitignore (haben wir schon)
6. **"Create repository"**

- [ ] Privates Repo erstellt

### 2.2 Lokal committen und pushen

Im entpackten `bodenova-books-worker` Ordner:

```bash
cd ~/Downloads/bodenova-books-worker

git init
git add .
git commit -m "Initial commit: Railway Books Worker"
git branch -M main
git remote add origin https://github.com/boderaffa1-sudo/bodenova-books-worker.git
git push -u origin main
```

**PRÜFEN:** `git status` zeigt vor dem commit KEINE `.env` oder `service-account*.json` Datei!

- [ ] Erster Push erfolgreich
- [ ] Auf github.com/boderaffa1-sudo/bodenova-books-worker sind alle Files sichtbar
- [ ] KEINE Secrets im Repo (keine `.env`, kein `service-account.json`)

---

## PHASE 3 — Railway-Deploy (15 Min)

### 3.1 Railway-Account & Projekt

1. [railway.com](https://railway.com) — Login mit GitHub
2. **"New Project"** → **"Deploy from GitHub repo"**
3. Repo auswählen: `boderaffa1-sudo/bodenova-books-worker`
4. **"Deploy"**
5. Railway startet den ersten Build — das dauert 2-3 Min
6. Er wird WAHRSCHEINLICH CRASHEN wegen fehlender Env-Vars — das ist ok!

- [ ] Projekt in Railway erstellt
- [ ] Erster Build durchgelaufen (Deploy failed ist normal jetzt)

### 3.2 Environment-Variablen setzen

Railway-Dashboard → dein Projekt → Tab **"Variables"** → **"+ New Variable"**

**Kritische Vars (Worker crasht sonst):**

Kopiere jede Zeile einzeln (Name = Wert):

```
AIRTABLE_PAT
= dein Airtable Personal Access Token (fängt mit "pat" an)

AIRTABLE_BASE_ID
= appWh8CQNQbpI1tLJ

GOOGLE_DRIVE_FOLDER_ID
= 1Oq9I55IinW-Q1AAekcnDfvwAt_IIf8Rd

GOOGLE_SERVICE_ACCOUNT_JSON_B64
= <kompletter Inhalt aus service-account-b64.txt, EINE Zeile!>

OPENAI_API_KEY
= dein OpenAI API Key (fängt mit "sk-" an)

TRIGGER_TOKEN
= <generiere einen zufälligen String, z.B. auf randomkeygen.com>

NODE_ENV
= production
```

- [ ] AIRTABLE_PAT gesetzt
- [ ] AIRTABLE_BASE_ID = appWh8CQNQbpI1tLJ
- [ ] GOOGLE_DRIVE_FOLDER_ID = 1Oq9I55IinW-Q1AAekcnDfvwAt_IIf8Rd
- [ ] GOOGLE_SERVICE_ACCOUNT_JSON_B64 (ganzer Base64-String)
- [ ] OPENAI_API_KEY
- [ ] TRIGGER_TOKEN (zufällig, aufschreiben — brauchst du gleich)
- [ ] NODE_ENV = production

### 3.3 Auto-Redeploy warten

Nach dem Setzen der Vars startet Railway einen neuen Build. Warten bis grün.

- [ ] Neuer Deploy grün (Symbol wird grün, "Active")

### 3.4 Öffentliche URL freischalten

Railway-Dashboard → **"Settings"** → **"Networking"** → **"Public Networking"** → **"Generate Domain"**

Du bekommst eine URL wie: `bodenova-books-worker-production.up.railway.app`

- [ ] Public URL generiert und kopiert

---

## PHASE 4 — Health-Check (2 Min)

Im Terminal:

```bash
curl https://DEINE-RAILWAY-URL/health
```

Erwartete Antwort:

```json
{
  "status": "ok",
  "services": {
    "airtable": "connected",
    "google_drive": "connected",
    "openai": "connected",
    ...
  }
}
```

**WENN "missing" bei airtable/google_drive/openai:**
→ Env-Var fehlt oder ist falsch. Nicht weitermachen! Zurück zu 3.2.

**WENN "connected" bei allen dreien kritischen:**
→ Basis läuft. Weiter zu Phase 5.

- [ ] Alle kritischen Services zeigen "connected"

---

## PHASE 5 — Einzelfoto-Test (5 Min)

**BEVOR du 15.000 Fotos verbrennst — teste EIN Foto.**

### 5.1 Vision-Worker manuell triggern (BATCH_SIZE=1)

Erst in Railway Variables temporär setzen:
```
VISION_BATCH_SIZE = 1
```

Deploy abwarten (grün).

### 5.2 Vision-Worker feuern

```bash
curl -X POST \
  -H "X-Trigger-Token: DEIN_TRIGGER_TOKEN" \
  https://DEINE-RAILWAY-URL/trigger/vision
```

Erwartete Antwort:
```json
{
  "accepted": true,
  "worker": "vision",
  "message": "Worker läuft im Hintergrund. Check /stats für Fortschritt."
}
```

### 5.3 Logs prüfen

Railway-Dashboard → **"Deployments"** → aktueller Deploy → **"View Logs"**

Suche nach Zeilen wie:
```
"worker":"vision" "msg":"Vision-Worker start"
"Drive files listed" "count":XXXXX
"New files to process" "new":1
"Vision analysis complete"
"Photo processed"
"Vision-Worker done" "success":1 "failed":0
```

- [ ] Vision-Worker hat 1 Foto verarbeitet
- [ ] `success: 1, failed: 0` in den Logs
- [ ] KEINE Base64-Errors, KEIN Memory-Crash

### 5.4 Airtable prüfen

Airtable öffnen → Photo_Queue → Sortiere nach `Created` DESC.

Neuester Record hat:
- [ ] GDrive_File_ID ist gesetzt
- [ ] AI_Objekttyp ist gesetzt (nicht leer)
- [ ] Titel ist gesetzt (wenn erkennbar)
- [ ] Status = "Verarbeitet"

**WENN das alles passt:** Der Worker funktioniert! Weiter zu Phase 6.

**WENN irgendwas fehlt:** STOPP. Logs kopieren und melden.

---

## PHASE 6 — Massen-Import starten (Cron aktivieren)

### 6.1 BATCH_SIZE hochsetzen

Railway Variables:
```
VISION_BATCH_SIZE = 20
```

### 6.2 Cron läuft automatisch

Bei `NODE_ENV=production` sind die Crons schon aktiv:
- Vision: alle 5 Min
- Consolidator: alle 15 Min
- Pricing/Listing/Cross-Delist: NOCH als Stub (nicht implementiert)

Du musst NICHTS aktiv anschieben. Warte einfach.

- [ ] BATCH_SIZE auf 20 hochgesetzt
- [ ] Neuer Deploy grün

### 6.3 Nach 30 Min prüfen

```bash
curl https://DEINE-RAILWAY-URL/stats
```

Erwartung:
```json
{
  "photo_queue": {
    "total": 60-120,
    "buecher_verarbeitet": 60-120
  },
  "workers": {
    "vision": {
      "runs": 5-6,
      "lastError": null,
      "paused": false
    }
  }
}
```

- [ ] `photo_queue.total` wächst kontinuierlich
- [ ] Kein Worker ist `paused: true`
- [ ] Keine `lastError` messages

### 6.4 Rechnung Volumen

Bei 20 Fotos alle 5 Min:
- 240 Fotos/Stunde
- 5760 Fotos/Tag
- **15.000 Fotos in ~2.6 Tagen durch**

OpenAI-Kosten: ~$3 einmalig für alle 15k.

---

## PHASE 7 — Monitoring (optional aber empfohlen)

### 7.1 Telegram-Alert Setup

1. Öffne Telegram → suche `@BotFather` → `/newbot`
2. Name: `Bodenova Books Alert`
3. Username: `bodenova_books_bot` (muss frei sein)
4. Kopiere den Bot-Token
5. Chat starten mit deinem Bot → schreib `/start`
6. Chat-ID rausfinden:
   ```bash
   curl "https://api.telegram.org/botDEIN_BOT_TOKEN/getUpdates"
   ```
   In der Antwort `"chat":{"id":123456789}` — das ist deine Chat-ID.

7. In Railway setzen:
```
TELEGRAM_BOT_TOKEN = <bot token>
TELEGRAM_CHAT_ID = <deine chat id>
```

- [ ] Telegram-Bot verbunden

### 7.2 Uptime-Monitor (kostenlos)

1. [betterstack.com](https://betterstack.com) oder [uptimerobot.com](https://uptimerobot.com)
2. Free-Plan, Account anlegen
3. Neuer Monitor → HTTP-Check
4. URL: `https://DEINE-RAILWAY-URL/health`
5. Interval: 5 Min
6. Alert-Email eintragen

- [ ] Uptime-Monitor aktiv

---

## PHASE 8 — Nach 3 Tagen: Consolidator-Check

Nach ~3 Tagen sollten alle 15k Fotos durch sein. Prüfen:

```bash
curl https://DEINE-RAILWAY-URL/stats
```

Erwartung:
```json
{
  "photo_queue": {
    "total": ~15000,
    "buecher_verarbeitet": ~15000,
    "consolidated": ~15000,
    "pending_consolidation": 0
  },
  "books": {
    "total": 2500-3500
  }
}
```

- [ ] `photo_queue.total` = ~15.000
- [ ] `books.total` = zwischen 2.500-3.500

**Wenn Zahlen deutlich abweichen:** Airtable manuell prüfen, Consolidator-Logs anschauen.

---

## PHASE 9 — Pricing + Listing bauen (später, separat)

Diese Worker sind noch als Stubs drin. Bauen wir wenn Vision + Consolidator sauber laufen.

Reihenfolge:
1. Erst Pricing (Booklooker + eBay Marktrecherche)
2. Dann Listing (Adapter pro Plattform)
3. Am Ende Cross-Delist

Jeder einzeln testen, jeder einzeln deployen.

**NICHT alles auf einmal bauen** — Fehler aus letzter Woche.

---

## Rot-Alarme (STOPP bei):

- ❌ Health-Check zeigt `missing` bei airtable/google_drive/openai → Env-Var falsch
- ❌ Worker ist `paused: true` → 3 Fehler hintereinander, Logs anschauen
- ❌ OpenAI-Usage > $5 an einem Tag → Budget-Bremse checken
- ❌ Airtable 429 (Rate Limit) → `VISION_CONCURRENCY` runter auf 3

---

## Bei Fragen

Alles in einer Sitzung mit mir schicken:
1. Welche Phase du bist
2. Welcher Check-Punkt fehlgeschlagen ist
3. Log-Auszug (letzte 20-30 Zeilen)
4. Optional: Screenshot vom Health-Check

Ich helfe dann direkt weiter.

---

## Zusammenfassung Zeitplan

| Phase | Dauer | Was |
|---|---|---|
| 0 | 5 Min | ZIP entpacken |
| 1 | 15 Min | Google Service-Account |
| 2 | 5 Min | GitHub-Repo |
| 3 | 15 Min | Railway-Deploy + Env-Vars |
| 4 | 2 Min | Health-Check |
| 5 | 5 Min | Einzelfoto-Test |
| 6 | Warten | Massen-Import (~3 Tage im Hintergrund) |
| 7 | 15 Min | Monitoring (optional) |
| 8 | 5 Min | Consolidator-Check |
| 9 | später | Pricing + Listing bauen |

**Aktiver Aufwand von dir:** ~60-70 Min bis Vision läuft. Rest ist warten + monitoring.
