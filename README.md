# Telos · Nomos

**Vom Pitch zum Bescheid. Reibungslos.**

Nomos ist die KI-Engine von Telos: Sie liest echte Businesspläne / Pitch-Decks ein,
findet passende öffentliche Fördermittel (Bund · Länder · EU) und generiert ~80 % des
offiziellen Förderantrags in formellem Behördendeutsch.

Diese Version ist **kein Mockup mehr**, sondern ein lauffähiges Produkt mit echter
KI-Anbindung (Anthropic Claude) über ein sicheres Node-Backend.

---

## Architektur

```
Browser (React UI, public/index.html)
        │  fetch  ───────────────────────────────────┐
        ▼                                             │
Node + Express (server/)         ANTHROPIC_API_KEY    │  Streaming
  /api/analyze   → Claude (structured JSON: Vorhaben + Matching)
  /api/translate → Claude (Gründer-Slang → Behördendeutsch, gestreamt)
  /api/generate  → Claude (Antragsentwurf als Markdown, gestreamt)
        │
        ▼
Claude Opus 4.7  (adaptive thinking, prompt caching)
```

- Der **API-Key liegt ausschließlich serverseitig** (Umgebungsvariable) — niemals im Browser.
- **PDF** wird von Claude nativ gelesen, **DOCX** wird mit `mammoth` zu Text extrahiert, **TXT** direkt verwendet.
- Die Förderlinien-Datenbank (`server/grants.js`) ist kuratiert; Claude matcht und begründet.

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

| Variable            | Default            | Bedeutung                                              |
| ------------------- | ------------------ | ------------------------------------------------------ |
| `ANTHROPIC_API_KEY` | —                  | **Pflicht.** Dein Anthropic-Key.                       |
| `PORT`              | `3000`             | Server-Port.                                           |
| `NOMOS_MODEL`       | `claude-opus-4-7`  | Modell. Günstiger/schneller: `claude-sonnet-4-6`.      |

---

## Nutzung

1. **Plan eingeben** — PDF/DOCX/TXT hochladen oder Text einfügen (auch lockerer Gründer-Slang).
2. **Analysieren** — Nomos extrahiert das Vorhaben und matcht Förderlinien mit Konfidenz + Begründung.
3. **Übersetzen** — auf Knopfdruck wird der Pitch in Behördendeutsch übersetzt.
4. **Antrag generieren** — eine Förderlinie wählen → strukturierter Antragsentwurf (≈80 %),
   live gestreamt, als PDF exportierbar (Druckdialog) oder kopierbar.

Mit `[BITTE ERGÄNZEN: …]` markierte Stellen brauchen deinen eigenen Input.

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

- Live-Websuche (Claude `web_search`) zur Ergänzung der kuratierten Förderdatenbank.
- Nutzerkonten + Speicherung von Anträgen (DB).
- Echte PDF-Export-Pipeline statt Druckdialog.
- Förderdatenbank gegen offizielle Quellen automatisiert aktuell halten.
