# Telos · Nomos

**Vom Pitch zum Bescheid. Reibungslos.**

**Telos** baut Infrastruktur, die Gründer:innen die bürokratischen Hürden abnimmt — als
Produktfamilie für jede Gründungsphase. **Nomos** ist das erste Produkt: aus Idee oder
Businessplan findet es passende öffentliche Fördermittel (Bund · Länder · EU) und
generiert ~80 % des offiziellen Förderantrags in formellem Behördendeutsch.

Lauffähiges Produkt mit echter KI-Anbindung (Anthropic Claude) über ein sicheres Node-Backend.

## Funktionen

- **Businessplan-Generator** — aus einer Ideenbeschreibung einen Plan erzeugen und im Dialog verfeinern.
- **Hyperlokales Matching** — kuratierte Förderdatenbank **+ automatische Web-Suche** zu einer Top-Liste kombiniert; Schnellsuche, Filter & Detailansicht mit konkreter Programm-/Formular-URL.
- **KI-Rückfragen** — gezielte Nachfragen schließen Lücken und passen den Score live an.
- **Behörden-Übersetzung** & **Antragsentwurf** (gestreamt, fortsetzungssicher), in der App **editierbar**, Export als **PDF / DOCX / Markdown**.
- **Vorgaben-Check**, **Checkliste** zusätzlicher Unterlagen und **PDF-Formular-Auto-Fill** (AcroForm).
- **Konten & Verlauf** — Login (E-Mail), Profil, gespeicherte Pitches/Anträge.
- **Spracheingabe** an Textfeldern; konsistentes „Creamy Minimalism"-Branding.

---

## Architektur

![Architektur von Nomos](architektur.svg)

Browser (React UI, `public/index.html`) → **Node + Express** (`server/`, API-Key serverseitig) → **Claude**.
Modelle gemischt: **deep = Sonnet 4.6** (Analyse/Antrag/Businessplan), **fast = Haiku 4.5** (Rückfragen/Compliance/Checklisten/Übersetzung). Endpunkte u. a.:

```
/api/analyze · /api/followup · /api/rescore        Matching + Rückfragen + Re-Scoring
/api/livesearch · /api/resolve                     Web-Suche: Programme + konkrete URLs
/api/businessplan · /api/businessplan/refine       Businessplan generieren/verfeinern
/api/translate · /api/generate                     Übersetzung · Antragsentwurf (gestreamt)
/api/compliance · /api/checklist · /api/export · /api/fillform   Prüfen · Checkliste · DOCX · PDF-Fill
/api/auth/* · /api/me · /api/profile · /api/pitches · /api/antraege   Konten & Verlauf
/healthz                                           Status (version, model, db)
```

- Der **API-Key liegt ausschließlich serverseitig** (Umgebungsvariable) — niemals im Browser.
- **PDF** wird von Claude nativ gelesen, **DOCX** via `mammoth`, **TXT** direkt.
- Förderdatenbank `server/grants.js` (kuratiert) + Live-Web-Suche; Speicher lokal (JSON) oder Postgres (`DATABASE_URL`).

---

## Voraussetzungen

- Node.js **≥ 20**
- Ein **Anthropic API-Key**

### Schritt für Schritt: API-Key besorgen

1. Gehe auf **https://console.anthropic.com** und melde dich an (oder registriere dich).
2. Lege unter **Billing** eine Zahlungsmethode an bzw. ein kleines Guthaben (die API ist
   nutzungsbasiert; eine Analyse + ein Antrag kosten typischerweise nur wenige Cent bis
   wenige Euro, je nach Plan-Länge).
3. Öffne **Settings → API Keys → Create Key**, kopiere den Key (`sk-ant-...`).
   Er wird nur **einmal** angezeigt — sicher speichern.
4. Trage ihn lokal ein (siehe unten). **Der Key gehört niemals ins Git-Repo** —
   `.env` ist in `.gitignore` ausgeschlossen.

---

## Lokal starten

> 🍎 **Mac-Nutzer ohne Vorkenntnisse?** Die Schritt-für-Schritt-Anleitung nur fürs Terminal
> steht in **[SCHNELLSTART-MAC.md](SCHNELLSTART-MAC.md)**.

```bash
# 1. Abhängigkeiten installieren
npm install

# 2. Key hinterlegen
cp .env.example .env
#   → .env öffnen und ANTHROPIC_API_KEY=sk-ant-... eintragen

# 3. Starten
npm start
#   → http://localhost:3000
```

Für die Entwicklung mit Auto-Reload:

```bash
npm run dev
```

### Konfiguration (`.env`)

| Variable            | Default              | Bedeutung                                                        |
| ------------------- | -------------------- | ---------------------------------------------------------------- |
| `ANTHROPIC_API_KEY` | —                    | **Pflicht.** Dein Anthropic-Key.                                 |
| `PORT`              | `3000`               | Server-Port.                                                     |
| `NOMOS_MODEL`       | `claude-sonnet-4-6`  | „deep"-Modell (Analyse/Antrag/Businessplan).                     |
| `NOMOS_MODEL_FAST`  | `claude-haiku-4-5`   | „fast"-Modell (Rückfragen/Compliance/Checklisten/Übersetzung).   |
| `SESSION_SECRET`    | (Dev-Fallback)       | Cookie-Signatur — in **Produktion zwingend** setzen.             |
| `DATABASE_URL`      | — (lokal JSON-Datei) | Gesetzt → PostgreSQL; sonst `data/store.json`.                   |

---

## Nutzung

1. **Plan eingeben** — PDF/DOCX/TXT hochladen oder Text einfügen (auch lockerer Gründer-Slang).
2. **Analysieren** — Nomos extrahiert das Vorhaben und matcht Förderlinien mit Konfidenz + Begründung.
3. **Live-Websuche (optional)** — auf Knopfdruck sucht Nomos mit `web_search` nach aktuellen,
   realen Förderprogrammen im Web und ergänzt die kuratierte Datenbank (mit Quell-Links).
4. **Übersetzen** — auf Knopfdruck wird der Pitch in Behördendeutsch übersetzt.
5. **Antrag generieren** — eine Förderlinie (kuratiert oder Live-Treffer) wählen → strukturierter Antragsentwurf (≈80 %),
   live gestreamt, als PDF exportierbar (Druckdialog) oder kopierbar.

Mit `[BITTE ERGÄNZEN: …]` markierte Stellen brauchen deinen eigenen Input.

Mit **Konto** (oben rechts „Anmelden") werden Analyse & Antrag automatisch in deinem
**Verlauf** gespeichert und sind später erneut aufrufbar; ohne Konto wird nichts gespeichert.

---

## Deployment (gehostet)

Lokal genügt `npm start` (Speicher: lokale JSON-Datei `data/store.json`). Für eine
öffentlich erreichbare Version mit dauerhaftem, gerätübergreifendem Speicher:

**Render (Blueprint, empfohlen)**
1. Repo auf GitHub → **render.com → New → Blueprint** → dieses Repo wählen (nutzt `render.yaml`).
2. Render legt Web-Service (Docker) **und** einen Postgres an. `DATABASE_URL` wird automatisch
   verknüpft, `SESSION_SECRET` automatisch erzeugt.
3. **`ANTHROPIC_API_KEY`** im Dashboard als Secret eintragen → Deploy.

**Allgemein (Docker / anderer Host)**
```bash
docker build -t telos-nomos .
docker run -p 3000:3000 \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -e SESSION_SECRET="$(openssl rand -hex 32)" \
  -e DATABASE_URL=postgres://user:pass@host:5432/db \
  telos-nomos
```

- Ist `DATABASE_URL` gesetzt → **PostgreSQL** (Tabellen werden beim Start automatisch angelegt);
  ohne → lokale JSON-Datei. `SESSION_SECRET` in Produktion **zwingend** setzen.
- Healthcheck-Endpunkt: `GET /healthz` (liefert u. a. `db` und `version`).

---

## Wichtige Hinweise

- **Kein Rechtsersatz:** Der generierte Antrag ist ein *Entwurf*. Beträge, Förderquoten und
  Förderfähigkeit in `server/grants.js` sind Richtwerte und müssen vor einer echten
  Antragstellung über die offizielle [Förderdatenbank des Bundes](https://www.foerderdatenbank.de)
  und die jeweilige Bewilligungsstelle verifiziert werden.
- **Datenschutz:** Hochgeladene Pläne werden zur Verarbeitung an die Anthropic-API gesendet
  und nicht serverseitig gespeichert. Für produktiven Einsatz mit echten Kundendaten:
  AVV/Datenschutz mit Anthropic klären und ein Datenschutz-Konzept ergänzen.

---

## Mögliche nächste Schritte

- Nutzerkonten + Speicherung von Anträgen (DB).
- Echte PDF-Export-Pipeline statt Druckdialog.
- Förderdatenbank gegen offizielle Quellen automatisiert aktuell halten.
