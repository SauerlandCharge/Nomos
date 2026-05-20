import "dotenv/config";
import express from "express";
import multer from "multer";
import mammoth from "mammoth";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

import { GRANTS, getGrantById } from "./grants.js";
import { ANALYZE_SYSTEM, ANALYZE_SCHEMA, TRANSLATE_SYSTEM, antragSystem } from "./prompts.js";

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

// ── /api/analyze ────────────────────────────────────────────────────────────
app.post("/api/analyze", upload.single("document"), async (req, res) => {
  try {
    const planBlocks = await buildPlanContent({ text: req.body.pitch, file: req.file });
    if (!hasContent(planBlocks)) {
      return res.status(400).json({ error: "Bitte gib einen Businessplan als Text ein oder lade ein PDF/DOCX hoch." });
    }

    const message = await client().messages.create({
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
    const grant = getGrantById(req.body.grantId);
    if (!grant) return res.status(400).json({ error: "Unbekannte Förderlinie." });

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

// Generischer Text-Streamer (Server-Sent-ähnlich, aber plain chunked).
async function streamText(res, { system, messages, max_tokens, effort }) {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.flushHeaders?.();

  const stream = client().messages.stream({
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
