# Schnellstart auf dem Mac (Terminal)

> Du brauchst nur: einen Mac, ~10 Minuten und einen gültigen Anthropic-API-Key
> (einen **neuen**, falls du den alten rotiert hast).

## 1. Terminal öffnen
`⌘ + Leertaste` → „Terminal" tippen → Enter.

## 2. Node.js installieren (einmalig)
Prüfen, ob schon vorhanden:
```
node -v
```
- Zeigt es `v20` oder höher (z. B. `v22.x`) → weiter zu Schritt 3.
- „command not found" oder älter als v20: auf https://nodejs.org den großen **LTS**-Button laden, die `.pkg` doppelklicken, Installer durchklicken. Danach **Terminal schließen und neu öffnen**, `node -v` erneut prüfen.

## 3. Code herunterladen (ZIP)
1. Repo öffnen: https://github.com/SauerlandCharge/Nomos
2. Oben sicherstellen, dass der Branch **main** gewählt ist.
3. Grüner Button **„Code" → „Download ZIP"**.
4. Im Finder (Ordner *Downloads*) die ZIP doppelklicken → Ordner **Nomos-main** entsteht.

## 4. In den Ordner wechseln
Tippfehlerfrei: im Terminal `cd ` schreiben (mit Leerzeichen), dann den Ordner **Nomos-main** aus dem Finder ins Terminal ziehen → Enter. Oder direkt:
```
cd ~/Downloads/Nomos-main
```

## 5. Abhängigkeiten installieren (einmalig)
```
npm install
```

## 6. API-Key hinterlegen
```
cp .env.example .env
open -e .env
```
TextEdit öffnet `.env`. `sk-ant-...` durch deinen echten Key ersetzen, speichern (`⌘S`), schließen. Die Datei bleibt nur auf deinem Mac.

## 7. Starten
```
npm start
```
Konsole zeigt: `Telos · Nomos läuft auf http://localhost:3000` und `✓ API-Key gefunden`.

## 8. App öffnen
```
open http://localhost:3000
```

## Beenden / Neustart
- Beenden: im Terminal **Control + C**.
- Neu starten: erneut `npm start` (Schritte 2–6 entfallen beim nächsten Mal).

## Schnellcheck
```
curl http://localhost:3000/healthz
```
→ `{"ok":true,"version":"…",...,"keyConfigured":true}` = Server läuft, Key erkannt.
Das `version`-Feld ist auch unten im Footer der App sichtbar („Build …").

## Änderungen erscheinen nicht?
Fast immer läuft dann ein **alter Stand**. So stellst du sicher, dass du das Neueste hast:
1. **Footer-Version prüfen:** unten in der App steht „Build …" — gleicht sie nicht der neuesten, läuft alter Code.
2. **Alten Ordner löschen:** ein vorhandenes `Nomos-main` (auch `Nomos-main 2` etc.) in *Downloads* komplett in den Papierkorb.
3. **Frische ZIP:** auf GitHub Branch **main** wählen → **Code → Download ZIP**, neu entpacken.
4. In den **neuen** Ordner `cd`, dann `npm install`, `.env` neu anlegen, `npm start`.
5. **Hard-Refresh** im Browser: `⌘ + Shift + R` (oder privates Fenster).
6. **Nur ein Server:** alte Terminal-Fenster mit `Control + C` beenden — sonst bedient ein alter Prozess Port 3000.

## Wenn etwas klemmt
- **`command not found: node`** → Node nicht installiert / Terminal nicht neu geöffnet (Schritt 2).
- **Konsole „✗ KEIN API-Key"** → `.env` fehlt/leer oder falscher Ordner (Schritt 4/6).
- **401 / Authentifizierung im UI** → Key ungültig (alten rotiert?) → neuen Key in `.env`.
- **Port belegt** → `PORT=3001 npm start`, dann `http://localhost:3001`.
- **Kosten:** ~0,30–0,60 € pro kompletter Durchlauf; günstiger mit `NOMOS_MODEL=claude-sonnet-4-6` in `.env`.

## Wenn etwas klemmt
- **`command not found: node`** → Node nicht installiert / Terminal nicht neu geöffnet (Schritt 2).
- **Konsole „✗ KEIN API-Key"** → `.env` fehlt/leer oder falscher Ordner (Schritt 4/6).
- **401 / Authentifizierung im UI** → Key ungültig (alten rotiert?) → neuen Key in `.env`.
- **Port belegt** → `PORT=3001 npm start`, dann `http://localhost:3001`.
- **Kosten:** ~0,30–0,60 € pro kompletter Durchlauf; günstiger mit `NOMOS_MODEL=claude-sonnet-4-6` in `.env`.
