import "dotenv/config";
import express from "express";
import multer from "multer";
import mammoth from "mammoth";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

import { GRANTS, getGrantById } from "./grants.js";
import { ANALYZE_SYSTEM, ANALYZE_SCHEMA, TRANSLATE_SYSTEM, LIVESEARCH_SYSTEM, FOLLOWUP_SYSTEM, FOLLOWUP_SCHEMA, RESCORE_SYSTEM, COMPLIANCE_SCHEMA, complianceSystem, antragSystem } from "./prompts.js";
import { buildDocx } from "./export.js";
import { repo, dbKind } from "./db.js";
import { hashPassword, verifyPassword, setSession, clearSession, attachUser, requireAuth, validEmail, publicUser } from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const MODEL = process.env.NOMOS_MODEL || "claude-opus-4-7";
// Bei jeder veröffentlichten Änderung erhöhen — im Footer sichtbar, damit ein
// veralteter lokaler Stand sofort auffällt.
const VERSION = "2026-05-20.6";

// Anthropic-Client lazy initialisieren, damit der Server auch ohne Key startet
// (und eine verständliche Fehlermeldung liefert statt zu crashen).
let _client = null;
function client() {
  if (!process.env.ANTHROPIC_API_KEY) {
    const err = new Error("ANTHROPIC_API_KEY fehlt. Lege eine .env-Datei an (siehe .env.example).");
    err.statusCode = 503;
    throw err;
  }
  if (!_client) _client = new Anthropic();
  return _client;
}

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use("/api", attachUser);
app.use(express.static(path.join(__dirname, "..", "public"), {
  setHeaders(res, filePath) {
    // HTML nie aus dem Browser-Cache bedienen — verhindert veraltete Ansichten.
    if (filePath.endsWith(".html")) res.setHeader("Cache-Control", "no-store");
  },
}));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

// Baut die User-Content-Blöcke aus optionalem Text + optionalem Dokument (PDF/DOCX/TXT).
async function buildPlanContent({ text, file }) {
  const blocks = [];
  let extracted = (text || "").trim();

  if (file) {
    const mime = file.mimetype || "";
    const name = (file.originalname || "").toLowerCase();
    if (mime === "application/pdf" || name.endsWith(".pdf")) {
      blocks.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: file.buffer.toString("base64") },
      });
    } else if (mime.includes("word") || name.endsWith(".docx")) {
      const { value } = await mammoth.extractRawText({ buffer: file.buffer });
      extracted = (extracted ? extracted + "\n\n" : "") + value.trim();
    } else {
      extracted = (extracted ? extracted + "\n\n" : "") + file.buffer.toString("utf-8").trim();
    }
  }

  if (extracted) blocks.push({ type: "text", text: extracted });
  return blocks;
}

function hasContent(blocks) {
  return blocks.some((b) => (b.type === "text" && b.text.length > 20) || b.type === "document");
}

// KI-Treffer mit den vollständigen Stammdaten der Förderlinie anreichern.
function enrichMatches(rawMatches) {
  return (rawMatches || [])
    .map((m) => {
      const g = getGrantById(m.id);
      if (!g) return null;
      return {
        id: g.id, name: g.name, provider: g.provider, region: g.region,
        amount: g.amount, fundingRate: g.fundingRate, summary: g.summary, url: g.url,
        fit: Math.max(0, Math.min(100, parseInt(m.fit, 10) || 0)), begruendung: m.begruendung,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.fit - a.fit);
}

// Akzeptierte Upload-Typen: PDF, DOCX, TXT.
function isSupportedFile(file) {
  const mime = file.mimetype || "";
  const name = (file.originalname || "").toLowerCase();
  return (
    mime === "application/pdf" || name.endsWith(".pdf") ||
    mime.includes("word") || name.endsWith(".docx") ||
    mime.startsWith("text/") || name.endsWith(".txt")
  );
}

// ── /api/analyze ────────────────────────────────────────────────────────────
app.post("/api/analyze", upload.single("document"), async (req, res) => {
  try {
    if (req.file && !isSupportedFile(req.file)) {
      return res.status(400).json({ error: "Nur PDF, DOCX oder TXT werden unterstützt." });
    }
    const planBlocks = await buildPlanContent({ text: req.body.pitch, file: req.file });
    if (!hasContent(planBlocks)) {
      return res.status(400).json({ error: "Bitte gib einen Businessplan als Text ein oder lade ein PDF/DOCX hoch." });
    }

    const stream = client().messages.stream({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "high",
        format: { type: "json_schema", schema: ANALYZE_SCHEMA },
      },
      system: [{ type: "text", text: ANALYZE_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Analysiere den folgenden Businessplan / das Pitch-Deck und finde passende Förderlinien:" },
            ...planBlocks,
          ],
        },
      ],
    });
    const message = await stream.finalMessage();

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock) throw new Error("Keine Analyse erhalten.");
    const analysis = salvageAnalysis(textBlock.text);
    if (!analysis) {
      throw new Error("Die Analyse konnte nicht gelesen werden (unvollständige Antwort). Bitte erneut versuchen.");
    }

    res.json({ ...analysis, matches: enrichMatches(analysis.matches) });
  } catch (err) {
    sendError(res, err);
  }
});

// ── /api/followup (gezielte Rückfragen zum Matching) ──────────────────────────
app.post("/api/followup", async (req, res) => {
  try {
    const { analysis } = req.body || {};
    if (!analysis) return res.status(400).json({ error: "Keine Analyse übergeben." });
    const context =
      `Vorhaben: ${analysis.projektname || ""} — ${analysis.einzeiler || ""}\n` +
      `Branche: ${analysis.branche || "k.A."} · Phase: ${analysis.phase || "k.A."} · Region: ${analysis.region || "k.A."}\n` +
      `Bisherige Treffer (id:fit): ${(analysis.matches || []).map((m) => `${m.id}:${m.fit}`).join(", ")}\n` +
      `Erkannte Lücken: ${(analysis.luecken || []).join("; ")}`;

    const stream = client().messages.stream({
      model: MODEL,
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: { type: "json_schema", schema: FOLLOWUP_SCHEMA } },
      system: [{ type: "text", text: FOLLOWUP_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `Finde offene, entscheidende Rückfragen für dieses Vorhaben:\n\n${context}` }],
    });
    const message = await stream.finalMessage();
    const textBlock = message.content.find((b) => b.type === "text");
    let questions = [];
    try { questions = (JSON.parse(textBlock.text).questions || []).slice(0, 3); } catch {}
    res.json({ questions });
  } catch (err) {
    sendError(res, err);
  }
});

// ── /api/rescore (Matching nach beantworteten Rückfragen neu bewerten) ────────
app.post("/api/rescore", async (req, res) => {
  try {
    const { analysis, answers } = req.body || {};
    if (!analysis || !Array.isArray(answers) || !answers.length) {
      return res.status(400).json({ error: "Analyse oder Antworten fehlen." });
    }
    const qa = answers.map((a) => `F: ${a.frage}\nA: ${a.antwort}`).join("\n\n");
    const context =
      `ERSTANALYSE (JSON):\n${JSON.stringify({ ...analysis, matches: (analysis.matches || []).map((m) => ({ id: m.id, fit: m.fit, begruendung: m.begruendung })) })}\n\n` +
      `ZUSÄTZLICHE ANTWORTEN DER GRÜNDER:INNEN:\n${qa}`;

    const stream = client().messages.stream({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: { type: "json_schema", schema: ANALYZE_SCHEMA } },
      system: [{ type: "text", text: RESCORE_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `Bewerte das Matching mit den Zusatzinfos neu:\n\n${context}` }],
    });
    const message = await stream.finalMessage();
    const textBlock = message.content.find((b) => b.type === "text");
    const updated = salvageAnalysis(textBlock?.text || "");
    if (!updated) throw new Error("Re-Scoring konnte nicht gelesen werden. Bitte erneut versuchen.");
    res.json({ ...updated, matches: enrichMatches(updated.matches) });
  } catch (err) {
    sendError(res, err);
  }
});

// ── /api/livesearch (Web-Suche nach aktuellen Förderprogrammen) ──────────────
app.post("/api/livesearch", async (req, res) => {
  try {
    const { projektname, einzeiler, branche, phase, region } = req.body || {};
    if (!einzeiler && !projektname) return res.status(400).json({ error: "Keine Vorhabensbeschreibung." });

    const query =
      `Vorhaben: ${projektname || "(unbenannt)"}\n` +
      `Beschreibung: ${einzeiler || ""}\n` +
      `Branche: ${branche || "k.A."}\nPhase: ${phase || "k.A."}\nRegion: ${region || "k.A."}\n\n` +
      `Finde aktuelle, reale öffentliche Förderprogramme, die zu diesem Vorhaben passen.`;

    let messages = [{ role: "user", content: query }];
    let final = null;
    const c = client();
    for (let i = 0; i < 6; i++) {
      const resp = await c.messages.create({
        model: MODEL,
        max_tokens: 6000,
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        system: [{ type: "text", text: LIVESEARCH_SYSTEM, cache_control: { type: "ephemeral" } }],
        tools: [{ type: "web_search_20260209", name: "web_search" }],
        messages,
      });
      if (resp.stop_reason === "pause_turn") {
        messages = [{ role: "user", content: query }, { role: "assistant", content: resp.content }];
        continue;
      }
      final = resp;
      break;
    }
    if (!final) throw new Error("Websuche nicht abgeschlossen.");

    const fullText = final.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
    const programs = extractPrograms(fullText);
    res.json({ programs });
  } catch (err) {
    sendError(res, err);
  }
});

// Defensives Parsen der Analyse: bei abgeschnittenem/unvollständigem JSON wird
// versucht, möglichst viel zu retten, statt komplett zu scheitern.
function salvageAnalysis(text) {
  if (!text) return null;
  let s = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```$/, "").trim();
  // 1) Direkter Versuch.
  try { return JSON.parse(s); } catch {}
  // 2) Größtes {…}-Segment.
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try { return JSON.parse(s.slice(start, end + 1)); } catch {}
  }
  // 3) Teil-Rettung: matches-Array + Skalarfelder per Regex bergen.
  const partial = {};
  const str = (key) => { const m = s.match(new RegExp('"' + key + '"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"')); return m ? m[1] : undefined; };
  for (const k of ["projektname", "einzeiler", "branche", "phase", "region"]) {
    const v = str(k); if (v !== undefined) partial[k] = v;
  }
  const matches = [];
  const re = /\{\s*"id"\s*:\s*"([^"]+)"\s*,\s*"fit"\s*:\s*(\d+)\s*,\s*"begruendung"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    matches.push({ id: m[1], fit: parseInt(m[2], 10), begruendung: m[3].replace(/\\"/g, '"') });
  }
  if (matches.length || Object.keys(partial).length) {
    return { staerken: [], luecken: [], ...partial, matches };
  }
  return null;
}

function extractPrograms(text) {
  let jsonStr = null;
  const fenced = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/);
  if (fenced) jsonStr = fenced[1];
  else {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) jsonStr = text.slice(start, end + 1);
  }
  if (!jsonStr) return [];
  try {
    const parsed = JSON.parse(jsonStr.trim());
    const list = Array.isArray(parsed) ? parsed : parsed.programs || [];
    return list
      .map((p, idx) => ({
        id: `live-${idx}`,
        live: true,
        name: String(p.name || "").slice(0, 200),
        provider: String(p.provider || "").slice(0, 120),
        region: String(p.region || "").slice(0, 60),
        amount: String(p.amount || "k.A.").slice(0, 120),
        fit: Math.max(0, Math.min(100, parseInt(p.fit, 10) || 60)),
        begruendung: String(p.begruendung || "").slice(0, 600),
        url: typeof p.url === "string" && /^https?:\/\//.test(p.url) ? p.url : null,
      }))
      .filter((p) => p.name)
      .sort((a, b) => b.fit - a.fit)
      .slice(0, 5);
  } catch {
    return [];
  }
}

// ── /api/translate (Streaming) ───────────────────────────────────────────────
app.post("/api/translate", async (req, res) => {
  const text = (req.body?.text || "").trim();
  if (!text) return res.status(400).json({ error: "Kein Text zum Übersetzen." });
  try {
    await streamText(res, {
      system: [{ type: "text", text: TRANSLATE_SYSTEM, cache_control: { type: "ephemeral" } }],
      max_tokens: 2000,
      effort: "medium",
      messages: [{ role: "user", content: `Übersetze in Behördendeutsch:\n\n${text}` }],
    });
  } catch (err) {
    sendError(res, err);
  }
});

// ── /api/generate (Streaming, Antragsentwurf) ─────────────────────────────────
app.post("/api/generate", upload.single("document"), async (req, res) => {
  try {
    let grant = getGrantById(req.body.grantId);
    if (!grant && req.body.grant) {
      // Live-Treffer aus der Websuche: ad-hoc Grant-Objekt, Felder normalisieren.
      try {
        const g = JSON.parse(req.body.grant);
        grant = {
          name: String(g.name || "Förderprogramm"),
          provider: String(g.provider || "k.A."),
          region: String(g.region || "k.A."),
          amount: String(g.amount || "k.A."),
          fundingRate: String(g.fundingRate || "k.A."),
          eligibility: String(g.begruendung || g.eligibility || "k.A."),
        };
      } catch { /* fällt unten in den Fehler */ }
    }
    if (!grant) return res.status(400).json({ error: "Unbekannte Förderlinie." });

    if (req.file && !isSupportedFile(req.file)) {
      return res.status(400).json({ error: "Nur PDF, DOCX oder TXT werden unterstützt." });
    }
    const planBlocks = await buildPlanContent({ text: req.body.pitch, file: req.file });
    if (!hasContent(planBlocks)) {
      return res.status(400).json({ error: "Kein Businessplan übergeben." });
    }
    const projektname = (req.body.projektname || "Vorhaben").slice(0, 120);

    await streamText(res, {
      system: [{ type: "text", text: antragSystem(grant), cache_control: { type: "ephemeral" } }],
      max_tokens: 16000,
      effort: "high",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: `Projektname: ${projektname}\n\nErstelle den Antragsentwurf auf Basis des folgenden Businessplans:` },
            ...planBlocks,
          ],
        },
      ],
    });
  } catch (err) {
    sendError(res, err);
  }
});

// ── Auth & Konto ──────────────────────────────────────────────────────────
app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password, name } = req.body || {};
    if (!validEmail(email)) return res.status(400).json({ error: "Bitte eine gültige E-Mail angeben." });
    if (!password || password.length < 8) return res.status(400).json({ error: "Passwort muss mindestens 8 Zeichen haben." });
    if (await repo.findUserByEmail(email.toLowerCase())) return res.status(409).json({ error: "Diese E-Mail ist bereits registriert." });
    const user = await repo.createUser({ email: email.toLowerCase(), pw_hash: hashPassword(password), name });
    setSession(res, user.id);
    res.json({ user: publicUser(user) });
  } catch (err) { sendError(res, err); }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const user = email ? await repo.findUserByEmail(String(email).toLowerCase()) : null;
    if (!user || !verifyPassword(password || "", user.pw_hash)) {
      return res.status(401).json({ error: "E-Mail oder Passwort ist falsch." });
    }
    setSession(res, user.id);
    res.json({ user: publicUser(user) });
  } catch (err) { sendError(res, err); }
});

app.post("/api/auth/logout", (req, res) => { clearSession(res); res.json({ ok: true }); });

app.get("/api/me", async (req, res) => {
  const profile = req.user ? await repo.getProfile(req.user.id) : null;
  res.json({ user: publicUser(req.user), profile });
});

app.post("/api/profile", requireAuth, async (req, res) => {
  try {
    const f = req.body || {};
    const fields = {};
    for (const k of ["company", "region", "branche", "stage", "website", "founders"]) {
      if (typeof f[k] === "string") fields[k] = f[k].slice(0, 500);
    }
    const profile = await repo.upsertProfile(req.user.id, fields);
    res.json({ profile });
  } catch (err) { sendError(res, err); }
});

// ── Verlauf (Pitches & Anträge) ─────────────────────────────────────────────
app.get("/api/pitches", requireAuth, async (req, res) => {
  try { res.json({ pitches: await repo.listPitches(req.user.id) }); } catch (err) { sendError(res, err); }
});
app.get("/api/pitches/:id", requireAuth, async (req, res) => {
  try {
    const p = await repo.getPitch(req.params.id, req.user.id);
    if (!p) return res.status(404).json({ error: "Nicht gefunden." });
    res.json({ pitch: p });
  } catch (err) { sendError(res, err); }
});
app.delete("/api/pitches/:id", requireAuth, async (req, res) => {
  try { await repo.deletePitch(req.params.id, req.user.id); res.json({ ok: true }); } catch (err) { sendError(res, err); }
});
app.post("/api/pitches", requireAuth, async (req, res) => {
  try {
    const { projektname, pitch_text, analysis } = req.body || {};
    const p = await repo.createPitch(req.user.id, { projektname, pitch_text, analysis });
    res.json({ id: p.id });
  } catch (err) { sendError(res, err); }
});
app.post("/api/antraege", requireAuth, async (req, res) => {
  try {
    const { pitch_id, grant_id, grant_name, content } = req.body || {};
    const a = await repo.createAntrag(req.user.id, { pitch_id, grant_id, grant_name, content });
    res.json({ id: a.id });
  } catch (err) { sendError(res, err); }
});

// ── /api/export (fertiges Dokument als DOCX) ─────────────────────────────────
app.post("/api/export", async (req, res) => {
  try {
    const { content, projektname } = req.body || {};
    if (!content || !String(content).trim()) return res.status(400).json({ error: "Kein Inhalt zum Exportieren." });
    const buf = await buildDocx(content, projektname || "Foerderantrag");
    const safe = String(projektname || "Foerderantrag").replace(/[^\w]+/g, "_").slice(0, 80) || "Foerderantrag";
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${safe}.docx"`);
    res.send(buf);
  } catch (err) { sendError(res, err); }
});

// ── /api/compliance (Entwurf gegen Förder-Vorgaben prüfen) ───────────────────
app.post("/api/compliance", async (req, res) => {
  try {
    let grant = getGrantById(req.body?.grantId);
    if (!grant && req.body?.grant) { try { grant = JSON.parse(req.body.grant); } catch {} }
    const content = req.body?.content;
    if (!grant) return res.status(400).json({ error: "Unbekannte Förderlinie." });
    if (!content || !String(content).trim()) return res.status(400).json({ error: "Kein Entwurf zum Prüfen." });

    const stream = client().messages.stream({
      model: MODEL,
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: { type: "json_schema", schema: COMPLIANCE_SCHEMA } },
      system: [{ type: "text", text: complianceSystem(grant), cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `Prüfe diesen Antragsentwurf:\n\n${String(content).slice(0, 60000)}` }],
    });
    const message = await stream.finalMessage();
    const textBlock = message.content.find((b) => b.type === "text");
    let result = { gesamt: "", items: [] };
    try { result = JSON.parse(textBlock.text); } catch {}
    res.json(result);
  } catch (err) { sendError(res, err); }
});

app.get("/api/grants", (_req, res) => res.json(GRANTS));

app.get("/healthz", (_req, res) =>
  res.json({ ok: true, version: VERSION, model: MODEL, keyConfigured: !!process.env.ANTHROPIC_API_KEY, db: dbKind() }));

// Generischer Text-Streamer (Server-Sent-ähnlich, aber plain chunked).
async function streamText(res, { system, messages, max_tokens, effort }) {
  // Client VOR dem Senden der Header holen, damit ein fehlender Key als
  // sauberes JSON-503 (statt leerem 200) zurückkommt.
  const c = client();

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const stream = c.messages.stream({
    model: MODEL,
    max_tokens,
    thinking: { type: "adaptive" },
    output_config: { effort },
    system,
    messages,
  });

  // Bricht der Client/Proxy ab (z. B. während langer adaptive-thinking-Phasen),
  // wird die Anthropic-Anfrage sauber gestoppt — kein hängender Handler, keine
  // verschwendeten Tokens.
  let aborted = false;
  res.on("close", () => { if (!res.writableEnded) { aborted = true; try { stream.abort(); } catch {} } });

  stream.on("text", (delta) => { if (!aborted) res.write(delta); });
  try {
    await stream.finalMessage();
    if (!aborted) res.end();
  } catch (err) {
    if (aborted) return; // bewusster Abbruch — keine Fehlerausgabe nötig
    res.write(`\n\n[FEHLER: ${err.message}]`);
    res.end();
  }
}

function sendError(res, err) {
  const status = err.statusCode || err.status || 500;
  const message =
    status === 503 || status === 401
      ? err.message || "Authentifizierung fehlgeschlagen — prüfe deinen ANTHROPIC_API_KEY."
      : err.message || "Interner Fehler.";
  console.error("[Nomos]", err);
  if (!res.headersSent) res.status(status).json({ error: message });
  else res.end();
}

app.listen(PORT, () => {
  const keyState = process.env.ANTHROPIC_API_KEY ? "✓ API-Key gefunden" : "✗ KEIN API-Key (siehe .env.example)";
  console.log(`\n  Telos · Nomos läuft auf http://localhost:${PORT}`);
  console.log(`  Modell: ${MODEL}   ${keyState}`);
  console.log(`  Speicher: ${dbKind() === "postgres" ? "PostgreSQL (DATABASE_URL)" : "lokale JSON-Datei (data/store.json)"}\n`);
});
