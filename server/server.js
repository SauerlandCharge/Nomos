import "dotenv/config";
import express from "express";
import multer from "multer";
import mammoth from "mammoth";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dns from "node:dns/promises";
import net from "node:net";
import Anthropic from "@anthropic-ai/sdk";

import { GRANTS, getGrantById } from "./grants.js";
import { ANALYZE_SYSTEM, ANALYZE_SCHEMA, TRANSLATE_SYSTEM, LIVESEARCH_SYSTEM, RESOLVE_SYSTEM, BUSINESSPLAN_SYSTEM, BUSINESSPLAN_REFINE_SYSTEM, FOLLOWUP_SYSTEM, FOLLOWUP_SCHEMA, RESCORE_SYSTEM, COMPLIANCE_SCHEMA, complianceSystem, CHECKLIST_SCHEMA, checklistSystem, antragSystem, EXPLORE_SYSTEM } from "./prompts.js";
import { buildDocx } from "./export.js";
import { readFields, fillFields } from "./forms.js";
import { repo, dbKind } from "./db.js";
import { hashPassword, verifyPassword, setSession, clearSession, attachUser, requireAuth, validEmail, publicUser } from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
// Gemischte Modelle: deep = stark (Analyse/Antrag/Businessplan), fast = schnell
// (Rückfragen/Compliance/Checklisten/URL-Auflösung). Beide per Env überschreibbar.
const MODELS = {
  deep: process.env.NOMOS_MODEL || "claude-sonnet-4-6",
  fast: process.env.NOMOS_MODEL_FAST || "claude-haiku-4-5",
};
const MODEL = MODELS.deep; // Default/Abwärtskompatibel
// Bei jeder veröffentlichten Änderung erhöhen — im Footer sichtbar, damit ein
// veralteter lokaler Stand sofort auffällt.
const VERSION = "2026-05-22.8";

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
app.set("trust proxy", 1); // hinter Proxy korrekte req.ip
app.use(express.json({ limit: "1mb" }));
app.use("/api", attachUser);

// Schlankes In-Memory-Rate-Limit für teure KI-Endpunkte (Kosten-/Missbrauchsschutz).
const RL_WINDOW_MS = 60 * 1000;
const RL_MAX = Number(process.env.NOMOS_RATE_LIMIT || 30); // Anfragen pro Fenster und IP
const RL_PATHS = new Set([
  "/api/analyze", "/api/rescore", "/api/followup", "/api/livesearch", "/api/resolve",
  "/api/generate", "/api/businessplan", "/api/businessplan/refine", "/api/translate",
  "/api/compliance", "/api/checklist", "/api/fillform", "/api/fillform-url", "/api/explore",
]);
const rlHits = new Map(); // ip -> { count, reset }
setInterval(() => { const now = Date.now(); for (const [k, v] of rlHits) if (v.reset <= now) rlHits.delete(k); }, RL_WINDOW_MS).unref?.();
app.use((req, res, next) => {
  if (!RL_PATHS.has(req.path)) return next();
  const now = Date.now();
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  let e = rlHits.get(ip);
  if (!e || e.reset <= now) { e = { count: 0, reset: now + RL_WINDOW_MS }; rlHits.set(ip, e); }
  e.count++;
  if (e.count > RL_MAX) {
    res.setHeader("Retry-After", Math.ceil((e.reset - now) / 1000));
    return res.status(429).json({ error: "Zu viele Anfragen — einen Moment, dann erneut versuchen." });
  }
  next();
});

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

  if (extracted) blocks.push({ type: "text", text: extracted.slice(0, 120000) }); // Cap gegen übergroße Eingaben
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
      max_tokens: 6000,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: ANALYZE_SCHEMA },
      },
      system: [{ type: "text", text: ANALYZE_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: `Heutiges Datum: ${new Date().toISOString().slice(0, 10)}.\nAnalysiere den folgenden Businessplan / das Pitch-Deck und finde passende Förderlinien:` },
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
      model: MODELS.fast,
      max_tokens: 4000,
      output_config: { format: { type: "json_schema", schema: FOLLOWUP_SCHEMA } },
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
      `Heutiges Datum: ${new Date().toISOString().slice(0, 10)}\n\n` +
      `ERSTANALYSE (JSON):\n${JSON.stringify({ ...analysis, matches: (analysis.matches || []).map((m) => ({ id: m.id, fit: m.fit, begruendung: m.begruendung })) })}\n\n` +
      `ZUSÄTZLICHE ANTWORTEN DER GRÜNDER:INNEN:\n${qa}`;

    const stream = client().messages.stream({
      model: MODEL,
      max_tokens: 6000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: { type: "json_schema", schema: ANALYZE_SCHEMA } },
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

// Eine Web-Recherche-Runde: Suchschleife bis zur finalen Antwort, dann Programme extrahieren.
// Akkumuliert die Konversation korrekt (assistant-Turns werden angehängt, nicht überschrieben),
// damit web-search/tool-Resultate über mehrere pause_turn-Runden erhalten bleiben.
async function webSearchPrograms(query, { maxIters = 8, idPrefix = "live", system = LIVESEARCH_SYSTEM } = {}) {
  const messages = [{ role: "user", content: query }];
  let final = null;
  const c = client();
  for (let i = 0; i < maxIters; i++) {
    const resp = await c.messages.create({
      model: MODEL,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      tools: [{ type: "web_search_20260209", name: "web_search" }],
      messages,
    });
    if (resp.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: resp.content });
      continue;
    }
    final = resp;
    break;
  }
  // Auch bei maxIters-Ende: alle bisher gesammelten Text-Blöcke (inkl. fence-JSON) auswerten.
  const sources = final ? [final, ...messages.filter((m) => m.role === "assistant")] : messages.filter((m) => m.role === "assistant");
  const fullText = sources.flatMap((m) => (m.content || []).filter((b) => b.type === "text").map((b) => b.text)).join("\n\n");
  return extractPrograms(fullText, idPrefix);
}

// ── /api/livesearch (web-getriebene Treffer, progressiv in zwei Wellen gestreamt) ──
app.post("/api/livesearch", async (req, res) => {
  const { projektname, einzeiler, branche, phase, region } = req.body || {};
  if (!einzeiler && !projektname) return res.status(400).json({ error: "Keine Vorhabensbeschreibung." });
  try { client(); } catch (err) { return sendError(res, err); } // fehlender Key → sauberes JSON-503

  const heute = new Date().toISOString().slice(0, 10);
  const base =
    `Heutiges Datum: ${heute}\n` +
    `Vorhaben: ${projektname || "(unbenannt)"}\n` +
    `Beschreibung: ${einzeiler || ""}\n` +
    `Branche: ${branche || "k.A."}\nPhase: ${phase || "k.A."}\nRegion: ${region || "k.A."}\n\n`;
  const q1 = base + `Finde die wichtigsten, naheliegend passenden, HEUTE (${heute}) noch beantragbaren öffentlichen Förderprogramme (Bund/Länder/EU) für dieses Vorhaben. Konzentriere dich auf die offensichtlichsten Treffer.`;
  const q2 = base + `Finde WEITERE, weniger offensichtliche, HEUTE (${heute}) noch beantragbare öffentliche Förderprogramme für dieses Vorhaben — auch Landes- und EU-Programme sowie Nischen-/Branchenförderungen. Vermeide Allerwelts-Treffer.`;

  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  let aborted = false;
  res.on("close", () => { if (!res.writableEnded) aborted = true; });
  const seen = new Set();
  const emit = (programs) => {
    for (const p of programs) {
      const k = (p.name || "").toLowerCase().trim();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      if (!aborted) res.write(JSON.stringify({ program: p }) + "\n");
    }
  };

  try {
    emit(await webSearchPrograms(q1, { maxIters: 4, idPrefix: "live1" })); // Welle 1: schnell
    if (aborted) return;
    emit(await webSearchPrograms(q2, { maxIters: 6, idPrefix: "live2" })); // Welle 2: breiter
    if (!aborted) res.end();
  } catch (err) {
    if (aborted) return;
    res.write(JSON.stringify({ error: err.message || "Websuche fehlgeschlagen." }) + "\n");
    res.end();
  }
});

// Konkrete Programm-/Formular-URL per Web-Suche auflösen (für /api/resolve und Auto-Formular).
async function resolveProgram({ name, provider, region }) {
  const query = `Programm: ${name}${provider ? " · " + provider : ""}${region ? " · " + region : ""}\nFinde die konkrete offizielle Programmseite und ggf. das Antragsformular.`;
  let messages = [{ role: "user", content: query }];
  let final = null;
  const c = client();
  for (let i = 0; i < 5; i++) {
    const resp = await c.messages.create({
      model: MODELS.deep,
      max_tokens: 3000,
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
      system: [{ type: "text", text: RESOLVE_SYSTEM, cache_control: { type: "ephemeral" } }],
      tools: [{ type: "web_search_20260209", name: "web_search" }],
      messages,
    });
    if (resp.stop_reason === "pause_turn") { messages = [{ role: "user", content: query }, { role: "assistant", content: resp.content }]; continue; }
    final = resp; break;
  }
  if (!final) throw new Error("Auflösung nicht abgeschlossen.");
  const txt = final.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const obj = extractJson(txt) || {};
  const httpOk = (u) => (typeof u === "string" && /^https?:\/\//.test(u) ? u : null);
  return { url: httpOk(obj.url), formUrl: httpOk(obj.formUrl), hinweis: String(obj.hinweis || "").slice(0, 300) };
}

// ── /api/resolve (konkrete Programm-URL + Formular per Web-Suche) ─────────────
app.post("/api/resolve", async (req, res) => {
  try {
    const { name, provider, region } = req.body || {};
    if (!name) return res.status(400).json({ error: "Kein Programmname." });
    res.json(await resolveProgram({ name, provider, region }));
  } catch (err) { sendError(res, err); }
});

function extractJson(text) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/);
  let s = fenced ? fenced[1] : null;
  if (!s) { const a = text.indexOf("{"), b = text.lastIndexOf("}"); if (a !== -1 && b > a) s = text.slice(a, b + 1); }
  if (!s) return null;
  try { return JSON.parse(s.trim()); } catch { return null; }
}

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

function extractPrograms(text, idPrefix = "live") {
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
      .map((p, idx) => {
        const frist = String(p.frist || "").slice(0, 80);
        const abgelaufen = /abgelaufen|verstrichen|geschlossen|beendet/i.test(frist);
        const antragMoeglich = p.antragMoeglich === false ? false : !abgelaufen;
        return {
          id: `${idPrefix}-${idx}`,
          live: true,
          name: String(p.name || "").slice(0, 200),
          provider: String(p.provider || "").slice(0, 120),
          region: String(p.region || "").slice(0, 60),
          amount: String(p.amount || "k.A.").slice(0, 120),
          frist: frist || "k.A.",
          antragMoeglich,
          fit: Math.max(0, Math.min(100, parseInt(p.fit, 10) || 60)),
          begruendung: String(p.begruendung || "").slice(0, 600),
          url: typeof p.url === "string" && /^https?:\/\//.test(p.url) ? p.url : null,
        };
      })
      .filter((p) => p.name && p.antragMoeglich)
      .sort((a, b) => b.fit - a.fit)
      .slice(0, 50);
  } catch {
    return [];
  }
}

// ── /api/businessplan (Idee → grober Businessplan, gestreamt) ────────────────
app.post("/api/businessplan", async (req, res) => {
  const idea = (req.body?.idea || "").trim();
  if (idea.length < 15) return res.status(400).json({ error: "Bitte beschreibe deine Idee etwas ausführlicher (min. 15 Zeichen)." });
  try {
    await streamText(res, {
      system: [{ type: "text", text: BUSINESSPLAN_SYSTEM, cache_control: { type: "ephemeral" } }],
      max_tokens: 16000, effort: "medium", model: MODELS.deep, continue: true,
      messages: [{ role: "user", content: `Erstelle einen ersten Businessplan aus dieser Idee:\n\n${idea}` }],
    });
  } catch (err) { sendError(res, err); }
});

// ── /api/businessplan/refine (Plan + Zusatzinfo → überarbeiteter Plan) ───────
app.post("/api/businessplan/refine", async (req, res) => {
  const plan = (req.body?.plan || "").trim();
  const message = (req.body?.message || "").trim();
  if (!plan || !message) return res.status(400).json({ error: "Plan oder Ergänzung fehlt." });
  try {
    await streamText(res, {
      system: [{ type: "text", text: BUSINESSPLAN_REFINE_SYSTEM, cache_control: { type: "ephemeral" } }],
      max_tokens: 16000, effort: "medium", model: MODELS.deep, continue: true,
      messages: [{ role: "user", content: `AKTUELLER BUSINESSPLAN:\n\n${plan}\n\n---\nERGÄNZUNG/WUNSCH DER GRÜNDER:INNEN:\n${message}` }],
    });
  } catch (err) { sendError(res, err); }
});

// ── /api/translate (Streaming) ───────────────────────────────────────────────
app.post("/api/translate", async (req, res) => {
  const text = (req.body?.text || "").trim();
  if (!text) return res.status(400).json({ error: "Kein Text zum Übersetzen." });
  try {
    await streamText(res, {
      system: [{ type: "text", text: TRANSLATE_SYSTEM, cache_control: { type: "ephemeral" } }],
      max_tokens: 2000,
      effort: "low",
      model: MODELS.fast,
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
      max_tokens: 32000,
      effort: "high",
      model: MODELS.deep,
      continue: true,
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
      model: MODELS.fast,
      max_tokens: 4000,
      output_config: { format: { type: "json_schema", schema: COMPLIANCE_SCHEMA } },
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

// ── /api/checklist (zusätzlich nötige Unterlagen je Förderlinie) ─────────────
app.post("/api/checklist", async (req, res) => {
  try {
    let grant = getGrantById(req.body?.grantId);
    if (!grant && req.body?.grant) { try { grant = JSON.parse(req.body.grant); } catch {} }
    if (!grant) return res.status(400).json({ error: "Unbekannte Förderlinie." });
    const plan = String(req.body?.plan || "").slice(0, 40000);

    const stream = client().messages.stream({
      model: MODELS.fast,
      max_tokens: 3000,
      output_config: { format: { type: "json_schema", schema: CHECKLIST_SCHEMA } },
      system: [{ type: "text", text: checklistSystem(grant), cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: plan ? `Vorhaben-Kontext:\n${plan}\n\nErstelle die Checkliste.` : "Erstelle die Checkliste für diese Förderlinie." }],
    });
    const message = await stream.finalMessage();
    const textBlock = message.content.find((b) => b.type === "text");
    let result = { gesamt: "", items: [] };
    try { result = JSON.parse(textBlock.text); } catch {}
    res.json(result);
  } catch (err) { sendError(res, err); }
});

// ── /api/fillform (ausfüllbares PDF mit Antrag/Plan befüllen) ────────────────
const FILLFORM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    fields: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { name: { type: "string" }, value: { type: "string" } },
        required: ["name", "value"],
      },
    },
  },
  required: ["fields"],
};
// KI-Mapping der Antrags-/Plan-Inhalte auf die Formularfelder + Befüllung.
// Wirft mit aussagekräftiger Meldung, wenn kein ausfüllbares AcroForm vorliegt.
async function fillPdf(pdfBuffer, content) {
  let fields;
  try { fields = await readFields(pdfBuffer); }
  catch { const e = new Error("PDF konnte nicht gelesen werden."); e.status = 400; throw e; }
  if (!fields.length) { const e = new Error("Kein ausfüllbares Formular (AcroForm-Felder) erkannt."); e.status = 400; throw e; }

  const context = String(content || "").slice(0, 50000);
  const fieldList = fields
    .map((f) => `- ${f.name} (${f.type})${f.options && f.options.length ? ` — erlaubte Werte: ${f.options.join(" | ")}` : ""}`)
    .join("\n");
  const sys = `Du bist „Nomos". Fülle die Felder eines deutschen Förder-/Antragsformulars auf Basis des bereitgestellten Antrags/Businessplans aus.
Regeln:
- Nutze NUR Informationen aus dem Kontext. Felder ohne belegbare Info LEER lassen (weglassen), niemals raten.
- Auswahl-/Radio-/Dropdown-Felder: gib GENAU einen der unter „erlaubte Werte" gelisteten Werte zurück (exakte Schreibweise). Passt kein gelisteter Wert, lass das Feld weg.
- Anrede/Geschlecht NUR setzen, wenn das Geschlecht der Person eindeutig aus dem Kontext hervorgeht; bei Unklarheit weglassen (nicht raten).
- Datumsformat TT.MM.JJJJ. Checkboxen: "Ja" oder weglassen.
- Kurze Faktenfelder (Name, Ort, Datum, Beträge): knapp und korrekt.
- Lange Freitextfelder (Feldname enthält z. B. Vorhaben, Beschreibung, Projekt, Ziele, Zusammenfassung, Darstellung): AUSFÜHRLICH, fachlich präzise und in formellem Behördendeutsch verschriftlichen — vollständige Sätze, mehrere Sätze/Absätze, nominalstilbetont, ohne Marketing. Nutze den Antragsentwurf als Grundlage.
Gib ausschließlich das JSON-Schema zurück (Liste {name,value} nur für befüllbare Felder).`;
  const stream = client().messages.stream({
    model: MODELS.deep,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: { type: "json_schema", schema: FILLFORM_SCHEMA } },
    system: [{ type: "text", text: sys }],
    messages: [{ role: "user", content: `FORMULARFELDER:\n${fieldList}\n\nANTRAG/BUSINESSPLAN:\n${context}` }],
  });
  const message = await stream.finalMessage();
  const tb = message.content.find((b) => b.type === "text");
  let mapping = {};
  try { for (const f of (JSON.parse(tb.text).fields || [])) if (f && f.name) mapping[f.name] = f.value; } catch {}
  return fillFields(pdfBuffer, mapping);
}

function sendFilledPdf(res, buffer, filled, projektname) {
  const safe = String(projektname || "Antrag").replace(/[^\w]+/g, "_").slice(0, 60) || "Antrag";
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${safe}_ausgefuellt.pdf"`);
  res.setHeader("X-Fields-Filled", String(filled));
  res.send(buffer);
}

app.post("/api/fillform", upload.single("form"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Bitte ein ausfüllbares PDF-Formular hochladen." });
    const { buffer, filled } = await fillPdf(req.file.buffer, req.body?.content);
    sendFilledPdf(res, buffer, filled, req.body?.projektname || "Antrag");
  } catch (err) { sendError(res, err); }
});

// SSRF-Schutz: private/loopback/link-local/metadata-Ziele blocken.
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) ||              // link-local / cloud-metadata (169.254.169.254)
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||    // CGNAT
      a >= 224;                                // multicast/reserved
  }
  const v = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (v === "::1" || v === "::") return true;
  if (v.startsWith("fe80") || v.startsWith("fc") || v.startsWith("fd")) return true; // link-local / ULA
  if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7)); // IPv4-mapped
  return false;
}
// Hostname auflösen und sicherstellen, dass KEINE Adresse intern ist.
async function assertPublicHttpUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { const e = new Error("Ungültige Formular-URL."); e.status = 400; throw e; }
  if (u.protocol !== "http:" && u.protocol !== "https:") { const e = new Error("Nur http/https erlaubt."); e.status = 400; throw e; }
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    const e = new Error("Interne Adresse nicht erlaubt."); e.status = 400; throw e;
  }
  let addrs;
  if (net.isIP(host)) addrs = [{ address: host }];
  else { try { addrs = await dns.lookup(host, { all: true }); } catch { const e = new Error("Host nicht auflösbar."); e.status = 400; throw e; } }
  if (addrs.some((a) => isPrivateIp(a.address))) { const e = new Error("Interne/private Adresse nicht erlaubt."); e.status = 400; throw e; }
  return u.href;
}

// PDF serverseitig laden (für Auto-Formular). SSRF-geschützt, Größe & PDF-Signatur geprüft,
// Redirects manuell verfolgt und je Hop erneut validiert.
async function fetchPdf(url) {
  let current = await assertPublicHttpUrl(url);
  let resp;
  for (let hop = 0; hop < 4; hop++) {
    try { resp = await fetch(current, { redirect: "manual", signal: AbortSignal.timeout(20000) }); }
    catch { const e = new Error("Formular-PDF konnte nicht geladen werden."); e.status = 502; throw e; }
    if (resp.status >= 300 && resp.status < 400 && resp.headers.get("location")) {
      current = await assertPublicHttpUrl(new URL(resp.headers.get("location"), current).href);
      continue;
    }
    break;
  }
  if (!resp || !resp.ok) { const e = new Error(`Formular nicht erreichbar (HTTP ${resp ? resp.status : "?"}).`); e.status = 502; throw e; }
  const ct = (resp.headers.get("content-type") || "").toLowerCase();
  const buf = Buffer.from(await resp.arrayBuffer());
  if (buf.length > 10 * 1024 * 1024) { const e = new Error("Formular-PDF ist zu groß (>10 MB)."); e.status = 400; throw e; }
  const looksPdf = ct.includes("pdf") || buf.subarray(0, 5).toString("latin1") === "%PDF-";
  if (!looksPdf) { const e = new Error("Die gefundene Datei ist kein PDF-Formular."); e.status = 400; throw e; }
  return buf;
}

// ── /api/fillform-url (Formular automatisch finden/laden und ausfüllen) ──────
app.post("/api/fillform-url", async (req, res) => {
  try {
    let { formUrl } = req.body || {};
    const { name, provider, region } = req.body || {};
    if (!formUrl) {
      if (!name) return res.status(400).json({ error: "Kein Programmname zur Formularsuche." });
      const r = await resolveProgram({ name, provider, region });
      formUrl = r.formUrl;
      if (!formUrl) return res.status(404).json({ error: "Kein ausfüllbares Formular gefunden — bitte manuell hochladen.", url: r.url || null });
    }
    const pdf = await fetchPdf(formUrl);
    const { buffer, filled } = await fillPdf(pdf, req.body?.content);
    res.setHeader("X-Form-Url", encodeURI(formUrl));
    sendFilledPdf(res, buffer, filled, req.body?.projektname || "Antrag");
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    sendError(res, err);
  }
});

// ── /api/explore (Entdecken: aktuelle Beispiel-Förderungen je Kategorie, gecacht) ──
const EXPLORE_CATEGORIES = [
  { key: "top",            label: "Top für Gründer",        seed: "allgemeine Gründungs-, Startup- und Existenzgründungsförderung (z. B. Gründungszuschuss, EXIST, Mikromezzanin, Förderkredite)" },
  { key: "ki",             label: "KI & Deep Tech",         seed: "Künstliche Intelligenz, Software, Deep Tech und Hochtechnologie" },
  { key: "nachhaltigkeit", label: "Nachhaltigkeit & Klima", seed: "Klimaschutz, Nachhaltigkeit, Energiewende, Ressourceneffizienz und GreenTech" },
  { key: "digitalisierung",label: "Digitalisierung",        seed: "Digitalisierung von Unternehmen, Industrie 4.0, digitale Geschäftsmodelle und IT" },
  { key: "forschung",      label: "Forschung & Hochschule", seed: "Forschung, Innovation, Technologietransfer und hochschulnahe Ausgründungen" },
  { key: "impact",         label: "Soziales & Impact",      seed: "Sozialunternehmen, Social Entrepreneurship, Gesundheit und gemeinwohlorientierte Vorhaben" },
  { key: "eu",             label: "EU-Programme",           seed: "EU-Förderprogramme für KMU und Start-ups (z. B. Horizon Europe, EIC, EU-Programme)" },
  { key: "regional",       label: "Regional / Länder",      seed: "regionale Landesförderprogramme der deutschen Bundesländer für Gründungen und KMU" },
];
const exploreCache = new Map(); // key -> { ts, programs }
const EXPLORE_TTL = 24 * 60 * 60 * 1000;

app.get("/api/explore/categories", (_req, res) =>
  res.json({ categories: EXPLORE_CATEGORIES.map(({ key, label }) => ({ key, label })) }));

app.get("/api/explore", async (req, res) => {
  try {
    const cat = EXPLORE_CATEGORIES.find((c) => c.key === String(req.query.category || ""));
    if (!cat) return res.status(400).json({ error: "Unbekannte Kategorie." });
    const cached = exploreCache.get(cat.key);
    if (cached && Date.now() - cached.ts < EXPLORE_TTL) {
      return res.json({ category: cat.key, label: cat.label, programs: cached.programs, cached: true });
    }
    const heute = new Date().toISOString().slice(0, 10);
    const query = `Heutiges Datum: ${heute}\nThema/Kategorie: ${cat.label} — ${cat.seed}\n\nFinde aktuell beantragbare, reale öffentliche Förderprogramme zu diesem Thema für Gründer:innen und junge Unternehmen in Deutschland/EU.`;
    const programs = await webSearchPrograms(query, { maxIters: 8, idPrefix: `exp-${cat.key}`, system: EXPLORE_SYSTEM });
    exploreCache.set(cat.key, { ts: Date.now(), programs });
    res.json({ category: cat.key, label: cat.label, programs, cached: false });
  } catch (err) { sendError(res, err); }
});

app.get("/api/grants", (_req, res) => res.json(GRANTS));

app.get("/healthz", (_req, res) =>
  res.json({ ok: true, version: VERSION, model: MODELS.deep, modelFast: MODELS.fast, keyConfigured: !!process.env.ANTHROPIC_API_KEY, db: dbKind() }));

// Generischer Text-Streamer (Server-Sent-ähnlich, aber plain chunked).
async function streamText(res, { system, messages, max_tokens, effort, model, continue: cont }) {
  // Client VOR dem Senden der Header holen, damit ein fehlender Key als
  // sauberes JSON-503 (statt leerem 200) zurückkommt.
  const c = client();
  const useModel = model || MODEL;

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  let aborted = false;
  res.on("close", () => { if (!res.writableEnded) aborted = true; });

  // Konversation lokal halten, um bei stop_reason="max_tokens" nahtlos
  // fortzusetzen (verhindert Abbruch mitten im Satz).
  const convo = [...messages];
  const maxContinuations = cont ? 3 : 0;

  try {
    for (let i = 0; i <= maxContinuations; i++) {
      // Haiku unterstützt weder adaptive thinking noch den effort-Parameter.
      const isHaiku = /haiku/i.test(useModel);
      const stream = c.messages.stream({
        model: useModel,
        max_tokens,
        ...(isHaiku ? {} : { thinking: { type: "adaptive" } }),
        ...(isHaiku ? {} : { output_config: { effort } }),
        system,
        messages: convo,
      });
      res.on("close", () => { try { stream.abort(); } catch {} });
      stream.on("text", (delta) => { if (!aborted) res.write(delta); });
      const final = await stream.finalMessage();
      if (aborted) return;
      if (final.stop_reason !== "max_tokens" || i === maxContinuations) break;
      // Fortsetzung anstoßen: bisherigen Output als Assistant-Turn anhängen.
      const soFar = final.content.filter((b) => b.type === "text").map((b) => b.text).join("");
      convo.push({ role: "assistant", content: soFar });
      convo.push({ role: "user", content: "Setze den vorherigen Text exakt dort fort, wo du aufgehört hast — ohne Wiederholung, ohne Vorrede." });
    }
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
  console.log(`  Modelle: deep=${MODELS.deep} · fast=${MODELS.fast}   ${keyState}`);
  console.log(`  Speicher: ${dbKind() === "postgres" ? "PostgreSQL (DATABASE_URL)" : "lokale JSON-Datei (data/store.json)"}\n`);
});
