# Architektur — Bodenova Books Worker

## Warum Railway statt n8n

**n8n-Probleme (aus Erfahrung 8. August):**
- Memory-Limit ~500 MB pro Execution → Vision-Batch > 6 crasht
- Cron-Frequenz frisst Executions auch bei leerer Queue
- Silent Failures ohne Alert
- Kein Loop-Detection (Vision crashte 85× ohne Reaktion)
- Executions-Kosten skalieren linear mit Volumen (100€/Mo bei 15k Fotos)

**Railway löst das:**
- Node-Prozess läuft dauerhaft mit vollem Zugriff auf Memory
- Cron im Code, nicht im Executions-Kontingent
- Structured Logging (Pino) → alle Fehler sichtbar
- Crash-Loop-Detection eingebaut
- Fixe Server-Kosten unabhängig vom Volumen

---

## Prinzipien

### 1. Fail-Safes First
Jeder Worker hat:
- `consecutiveFails`-Zähler
- Auto-Pause nach 3 gleichen Fehlern
- Alert via Telegram/Email bei Pause

### 2. Read-after-Write
Bei jedem Airtable-Update:
```
1. PATCH senden
2. GET nachladen
3. Prüfen: Wert wirklich gespeichert?
4. Wenn nein → warn-Log + Manual Review
```

Löst den Bug den wir bei n8n hatten: Airtable meldet 200 aber schreibt nix (Formel-Feld-Block).

### 3. Impact-Rechnung vor Cron-Änderung
Vor jedem Cron-Deploy: Kommentar mit Kalkulation im Code.

Beispiel Vision-Cron alle 5 Min:
- 288 Runs/Tag × 20 Fotos = 5760 Fotos/Tag Kapazität
- Bei 15k Fotos: nach ~3 Tagen alle durch
- Danach idle (Queue leer → sofort return)

### 4. Test-vor-Deploy
Jeder Worker: `--dry-run` Flag → verarbeitet 1 Foto und printed Ergebnis ohne Airtable-Write.

### 5. Sunk-Cost-Detection
Fotos die 3× hintereinander OpenAI-Fehler produzieren:
- Status wird auf `Manual_Review` gesetzt
- Nicht mehr retried
- User sieht sie im Airtable-View für manuelle Korrektur

---

## Datenfluss

```
┌─────────────────────────────────────────────────────────────────┐
│  Google Drive Bücher-Ordner (15.000 Fotos)                      │
│  Owner-Zugriff: readonly für Service-Account                    │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       │ Vision-Worker (alle 5 Min)
                       │ • Filter: nur neue (nicht in Photo_Queue)
                       │ • Batch 20 parallel
                       │ • detail: low für Kosten-Effizienz
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  Airtable Photo_Queue (tblSENLJuXV5Nd8O9)                       │
│  Ein Record pro Foto mit AI-Metadaten                           │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       │ Consolidator (alle 15 Min)
                       │ • Cover-basierte Buch-Gruppierung
                       │ • Umlaut-Fuzzy für Duplikate
                       │ • Time-Fallback für Waisen-Fotos
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  Airtable Inventory Items — Category=Book                       │
│  Ein Record pro Buch (aus 3-8 Fotos konsolidiert)               │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       │ Pricing-Worker (alle 2h)
                       │ • Booklooker + eBay Marktrecherche
                       │ • Preise nach Strategie C setzen
                       │ • Approved_for_Listing = true
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  Books mit Preis + Ready_to_List=true                           │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       │ Listing-Worker (alle 30 Min)
                       │ • Parallel auf 4 Plattformen
                       │ • Listing-IDs speichern
                       ▼
        ┌──────────────┼──────────────┬──────────────┐
        ▼              ▼              ▼              ▼
   Booklooker      AbeBooks         eBay         Salvante
   (API-Upload)  (CSV per Mail)  (Trading API)  (Supabase)
        │              │              │              │
        └──────────────┴───────┬──────┴──────────────┘
                              │
                              │ Cross-Delist-Worker (alle 15 Min)
                              │ • Prüft alle 4 Plattformen
                              │ • Bei Sale: sofort auf 3 anderen delisten
                              │ • Mail + Telegram-Notification
                              ▼
                         Verkauft ✓
```

---

## Cover-basierte Buch-Gruppierung (User-Feedback vom 9. Aug)

**User-Beobachtung:**
> „Cover = neues Buch. Alles bis zum nächsten Cover gehört zum aktuellen Buch."
> „Bei mehreren Bänden fotografiere ich oft 1× Cover, dann nur Buchrücken der anderen."

**Algorithmus:**

```
Sortiere Fotos chronologisch (Aufnahmezeit aus Filename YYYYMMDD_HHMMSS.jpg)

currentBook = null

for photo in photos:
    if photo.objekttyp == 'cover_modern' oder 'cover_antik':
        if currentBook: push(currentBook)
        currentBook = neues Buch aus diesem Foto
        
    elif photo.objekttyp == 'mehrere_buchruecken':
        # Eigene Gruppe (Regal-Foto)
        if currentBook: push(currentBook)
        push(regal-gruppe)
        currentBook = null
        
    elif photo.objekttyp == 'titelseite_innen':
        if not currentBook oder currentBook hat schon Cover:
            currentBook = neues Buch aus diesem Foto
        else:
            addToBook(currentBook, photo)
            
    else:  # rueckseite, impressum, innenseite, buchruecken, unbekannt
        if currentBook:
            addToBook(currentBook, photo)
            # Titelseite/Impressum kann fehlende Metadaten liefern
            if photo hat Autor/Verlag/Jahr/ISBN → aufwerten
        elif photo hat Titel:
            # Waisenkind mit Titel → eigenes Buch
            currentBook = neues Buch aus diesem Foto
        # sonst: skippen
    
    # Time-Fallback: großer Gap = neues Buch
    if photoTime - currentBook.lastPhotoTime > 5 Min:
        push(currentBook)
        currentBook = neues Buch aus diesem Foto

push(currentBook)
```

---

## Airtable-Schema-Nutzung

Wir nutzen die **existierende** `Inventory Items` Tabelle (nicht die alte `Books`).

Vorteile:
- Multi-Kategorie-Support (Book, Furniture, Lamp, Mirror, Art, Other)
- Vorhandene AI-Felder (`Item Summary (AI)`, `Suggested Listing Title (AI)`)
- Bereits Plattform-Felder für 12 Marktplätze
- Photo_Queue verlinkt via `fldUVO2v2ou0jlWr4`

Für Bücher nutzen wir:
- `Category = "Book"`
- `Author`, `Publisher`, `Publication_Year`, `Edition`, `Language`, `Book_Condition`
- `First_Edition`, `Signed`, `Dust_Jacket` (Checkboxes)
- `Vergilbung_Grad`, `Markierungen_Typ`
- `ISBN`, `ISBN_Confidence`
- `Booklooker_Listing_ID`, `AbeBooks_Listing_ID`, `eBay_Listing_ID`
- `Consolidated`, `Photo_Count`, `Book_Hash` (neu, muss ich anlegen)

---

## Nächste Ausbaustufen

Nach Livegang:
1. **Booklooker-Preisrecherche** verbessern (Median vs. Min-Unterbieten)
2. **AbeBooks-CSV** automatisch bei Batch >20 Bücher erzeugen und mailen
3. **Salvante-Frontend-Sync** — direktes Supabase-Insert mit Photo-URLs
4. **eBay Sales-Webhook** für Sofort-Delist (statt 15-Min-Polling)
5. **Kategorien-Erweiterung** — nicht nur Bücher, auch Möbel/Kunst
