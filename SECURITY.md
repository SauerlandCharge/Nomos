# Sicherheit · Telos · Nomos

Der **ANTHROPIC_API_KEY** ist das wichtigste Geheimnis. Ein geleakter Key wird von
Bots binnen Minuten von öffentlichen Repos abgegriffen und missbraucht (Guthaben weg).
Diese Regeln stellen sicher, dass das **nie wieder** passiert.

## Goldene Regeln
- **Key NUR in einer lokalen `.env`** (per `.gitignore` ausgeschlossen). Niemals in
  `.env.example`, Code, Doku, Commits, Issues, Screenshots oder Logs.
- `.env.example` enthält ausschließlich den **Platzhalter** `sk-ant-...`.
- In Produktion: Key als **Umgebungsvariable / Secret** des Hosts setzen (z. B. Render),
  nicht im Repo.

## Schutzmechanismen in diesem Repo
- **`.gitignore`** ignoriert `.env` und alle `.env.*` (außer `.env.example`).
- **Pre-Commit-Hook** (`.githooks/pre-commit`) blockiert Commits, die eine `.env`
  enthalten oder ein Key-Muster (`sk-ant-…`) im Diff haben.
  - Aktivierung passiert automatisch via `npm install` (Script `postinstall`).
  - Manuell aktivieren: `git config core.hooksPath .githooks`
- Empfohlen auf GitHub: **Repository privat**, **Secret Scanning + Push Protection** an,
  **GitHub Pages** deaktivieren, falls nicht benötigt.

## Wenn ein Key doch geleakt ist
1. **Sofort widerrufen:** console.anthropic.com → Settings → API Keys → alten Key löschen.
2. **Neuen Key erzeugen**, nur in `.env` eintragen.
3. **Spend-Limit setzen** (Console → Billing/Limits), damit Missbrauch begrenzt ist.
4. **Usage-Log prüfen** (Zeitpunkt, Modell, Volumen, betroffener Key).
5. Key aus der Git-Historie entfernen (`git filter-repo --replace-text …`) — ersetzt
   den Vorfall aber **nicht** die Rotation: Ein einmal gepushter Key gilt als kompromittiert.

## Datenverarbeitung
- Übertragung TLS-verschlüsselt. Ohne Konto wird nichts dauerhaft gespeichert; mit Konto
  liegen Analyse/Eingaben nur im Konto und sind löschbar. Hochgeladene Dateien werden
  nicht dauerhaft gespeichert. Inhalte werden laut Anthropics Geschäftsbedingungen nicht
  zum Training der Modelle verwendet.
