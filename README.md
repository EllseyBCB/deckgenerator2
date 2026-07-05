# 🧙 Wizard Kartendeck-Generator

Ein kleines Tool, das aus wenigen hochgeladenen Bildern automatisch ein
komplettes **Wizard-Kartendeck** (60 Karten) baut und als **ZIP-Datei**
ausgibt – fertig zum Einfügen ins Spiel.

Läuft komplett **lokal im Browser**: keine Installation, kein Server, keine
Internetverbindung nötig. Deine Bilder verlassen deinen Rechner nicht.

## Benutzen

1. `index.html` im Browser öffnen (Doppelklick genügt).
2. Bilder hochladen (klicken oder per Drag & Drop):
   - **4 Farb-Designs** – je ein Hintergrundbild für Rot / Gelb / Grün / Blau.
   - **13 Zahlen (1–13)** – immer dieselbe Farbe; werden auf jeden Farbhintergrund
     montiert. Transparenter Hintergrund (PNG) empfohlen.
   - **Zauberer** (1 Bild) und **Narr** (1 Bild) – werden je 4× verwendet, ohne Zahl.
3. In der **Live-Vorschau** die Zahl-Anordnung feinjustieren
   (Größe mittig, Ecken, Rand-Abstand, Ausgabe-Breite).
4. **„Deck generieren (60 Karten) → ZIP"** klicken → `wizard-deck.zip` wird
   heruntergeladen.

## Ausgabe

- **60 PNG-Dateien** in einer ZIP:
  `R1`–`R13`, `Y1`–`Y13`, `G1`–`G13`, `B1`–`B13`, `Z1`–`Z4`, `N1`–`N4`
  (R=Rot, Y=Gelb, G=Grün, B=Blau, Z=Zauberer, N=Narr).
- Jede Karte: PNG, **exakt 33:50** (Standard 660×1000 px).
- Der Hintergrund/Rahmen liegt **randlos an allen 4 Kanten** (Center-Crop
  „cover" – niemals mit dunklem Rand). Bilder mit anderem Format (z. B.
  1024×1536) werden automatisch mittig auf 33:50 zugeschnitten.
- **Keine `back.png`** – die Rückseite kommt im Spiel vom Standard-Deck.

## Hinweise

- **Dateigröße**: Ziel ~200–400 KB je Karte. Bei sehr detailreichen Bildern
  kann es mehr werden – dann die Ausgabe-Breite reduzieren (das Tool warnt bei
  Karten über 500 KB).
- **Einstellungen** (Anordnung, Ausgabe-Breite) werden im Browser gespeichert
  und beim nächsten Öffnen wiederhergestellt. Die Bilder müssen erneut geladen
  werden.

## Aufbau

| Datei         | Zweck                                              |
|---------------|----------------------------------------------------|
| `index.html`  | Oberfläche (Uploads, Vorschau, Einstellungen)      |
| `styles.css`  | Layout                                             |
| `app.js`      | Kompositing (Canvas), Vorschau, ZIP-Erzeugung      |

Keine externen Abhängigkeiten – der ZIP-Writer ist eingebaut.
