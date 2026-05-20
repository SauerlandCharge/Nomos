import "dotenv/config";
import express from "express";
import multer from "multer";
import mammoth from "mammoth";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

import { GRANTS, getGrantById } from "./grants.js";
import { ANALYZE_SYSTEM, ANALYZE_SCHEMA, TRANSLATE_SYSTEM, LIVESEARCH_SYSTEM, antragSystem } from "./prompts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const MODEL = process.env.NOMOS_MODEL || "claude-opus-4-7";

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
app.use(express.static(path.join(__dirname, "..", "public")));

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
    let analysis;
    try {
      analysis = JSON.parse(textBlock.text);
    } catch {
      throw new Error("Die Analyse konnte nicht gelesen werden (unvollständige Antwort). Bitte erneut versuchen.");
    }

    // Treffer mit den vollständigen Stammdaten anreichern.
    const matches = (analysis.matches || [])
      .map((m) => {
        const g = getGrantById(m.id);
        if (!g) return null;
        return {
          id: g.id, name: g.name, provider: g.provider, region: g.region,
          amount: g.amount, fundingRate: g.fundingRate,
          fit: Math.max(0, Math.min(100, m.fit)), begruendung: m.begruendung,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.fit - a.fit);

    res.json({ ...analysis, matches });
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

app.get("/api/grants", (_req, res) => res.json(GRANTS));

app.get("/healthz", (_req, res) =>
  res.json({ ok: true, model: MODEL, keyConfigured: !!process.env.ANTHROPIC_API_KEY }));

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

  stream.on("text", (delta) => res.write(delta));
  try {
    await stream.finalMessage();
    res.end();
  } catch (err) {
    // Stream lief schon — Fehler inline anhängen.
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
  console.log(`  Modell: ${MODEL}   ${keyState}\n`);
});
