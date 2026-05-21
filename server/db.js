// Datenschicht für Telos · Nomos.
// Lokal (ohne DATABASE_URL): einfache JSON-Datei unter data/store.json — läuft
// sofort bei `npm start`, ohne Native-Build. In Produktion (DATABASE_URL gesetzt):
// PostgreSQL via `pg`. Beide implementieren dasselbe Repository-Interface.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const nowIso = () => new Date().toISOString();
const newId = () => crypto.randomUUID();

/* ─────────────────────────── JSON-Backend (lokal) ─────────────────────────── */
function jsonBackend() {
  const dir = path.join(__dirname, "..", "data");
  const file = path.join(dir, "store.json");
  let data = { users: [], profiles: [], pitches: [], antraege: [] };
  try {
    if (fs.existsSync(file)) data = { ...data, ...JSON.parse(fs.readFileSync(file, "utf8")) };
  } catch { /* korrupte Datei → frischer Start */ }
  let queue = Promise.resolve();
  const persist = () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  };
  // Schreibvorgänge serialisieren (einfacher Single-Process-Schutz).
  const save = () => { queue = queue.then(persist, persist); return queue; };

  return {
    kind: "json",
    async init() { persist(); },
    async createUser(u) { data.users.push(u); await save(); return u; },
    async findUserByEmail(email) { return data.users.find((x) => x.email === email) || null; },
    async findUserById(id) { return data.users.find((x) => x.id === id) || null; },
    async getProfile(userId) { return data.profiles.find((p) => p.user_id === userId) || null; },
    async upsertProfile(p) {
      const i = data.profiles.findIndex((x) => x.user_id === p.user_id);
      if (i >= 0) data.profiles[i] = { ...data.profiles[i], ...p }; else data.profiles.push(p);
      await save(); return data.profiles.find((x) => x.user_id === p.user_id);
    },
    async createPitch(p) { data.pitches.push(p); await save(); return p; },
    async listPitches(userId) {
      return data.pitches.filter((x) => x.user_id === userId)
        .map(({ analysis_json, pitch_text, ...rest }) => rest)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    },
    async getPitch(id, userId) { return data.pitches.find((x) => x.id === id && x.user_id === userId) || null; },
    async deletePitch(id, userId) {
      data.pitches = data.pitches.filter((x) => !(x.id === id && x.user_id === userId));
      data.antraege = data.antraege.filter((x) => !(x.pitch_id === id && x.user_id === userId));
      await save();
    },
    async createAntrag(a) { data.antraege.push(a); await save(); return a; },
    async listAntraege(pitchId, userId) {
      return data.antraege.filter((x) => x.pitch_id === pitchId && x.user_id === userId)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    },
  };
}

/* ─────────────────────────── Postgres-Backend (prod) ──────────────────────── */
async function pgBackend(url) {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  const q = (text, params) => pool.query(text, params);
  return {
    kind: "postgres",
    async init() {
      await q(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, pw_hash TEXT, name TEXT,
        provider TEXT NOT NULL DEFAULT 'password', created_at TEXT NOT NULL)`);
      await q(`CREATE TABLE IF NOT EXISTS profiles (
        user_id TEXT PRIMARY KEY, company TEXT, region TEXT, branche TEXT, stage TEXT,
        website TEXT, founders TEXT, updated_at TEXT)`);
      await q(`CREATE TABLE IF NOT EXISTS pitches (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, projektname TEXT, pitch_text TEXT,
        analysis_json TEXT, created_at TEXT NOT NULL)`);
      await q(`CREATE TABLE IF NOT EXISTS antraege (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, pitch_id TEXT, grant_id TEXT,
        grant_name TEXT, content TEXT, created_at TEXT NOT NULL)`);
    },
    async createUser(u) {
      await q(`INSERT INTO users (id,email,pw_hash,name,provider,created_at) VALUES ($1,$2,$3,$4,$5,$6)`,
        [u.id, u.email, u.pw_hash, u.name, u.provider, u.created_at]);
      return u;
    },
    async findUserByEmail(email) { return (await q(`SELECT * FROM users WHERE email=$1`, [email])).rows[0] || null; },
    async findUserById(id) { return (await q(`SELECT * FROM users WHERE id=$1`, [id])).rows[0] || null; },
    async getProfile(userId) { return (await q(`SELECT * FROM profiles WHERE user_id=$1`, [userId])).rows[0] || null; },
    async upsertProfile(p) {
      await q(`INSERT INTO profiles (user_id,company,region,branche,stage,website,founders,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (user_id) DO UPDATE SET company=$2,region=$3,branche=$4,stage=$5,website=$6,founders=$7,updated_at=$8`,
        [p.user_id, p.company, p.region, p.branche, p.stage, p.website, p.founders, p.updated_at]);
      return this.getProfile(p.user_id);
    },
    async createPitch(p) {
      await q(`INSERT INTO pitches (id,user_id,projektname,pitch_text,analysis_json,created_at) VALUES ($1,$2,$3,$4,$5,$6)`,
        [p.id, p.user_id, p.projektname, p.pitch_text, p.analysis_json, p.created_at]);
      return p;
    },
    async listPitches(userId) {
      return (await q(`SELECT id,user_id,projektname,created_at FROM pitches WHERE user_id=$1 ORDER BY created_at DESC`, [userId])).rows;
    },
    async getPitch(id, userId) { return (await q(`SELECT * FROM pitches WHERE id=$1 AND user_id=$2`, [id, userId])).rows[0] || null; },
    async deletePitch(id, userId) {
      await q(`DELETE FROM antraege WHERE pitch_id=$1 AND user_id=$2`, [id, userId]);
      await q(`DELETE FROM pitches WHERE id=$1 AND user_id=$2`, [id, userId]);
    },
    async createAntrag(a) {
      await q(`INSERT INTO antraege (id,user_id,pitch_id,grant_id,grant_name,content,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [a.id, a.user_id, a.pitch_id, a.grant_id, a.grant_name, a.content, a.created_at]);
      return a;
    },
    async listAntraege(pitchId, userId) {
      return (await q(`SELECT * FROM antraege WHERE pitch_id=$1 AND user_id=$2 ORDER BY created_at DESC`, [pitchId, userId])).rows;
    },
  };
}

let _be = null;
async function backend() {
  if (_be) return _be;
  _be = process.env.DATABASE_URL ? await pgBackend(process.env.DATABASE_URL) : jsonBackend();
  await _be.init();
  return _be;
}

export function dbKind() { return process.env.DATABASE_URL ? "postgres" : "json"; }

/* ─────────────────────────── Öffentliches Repository ──────────────────────── */
export const repo = {
  async createUser({ email, pw_hash, name }) {
    return (await backend()).createUser({ id: newId(), email, pw_hash, name: name || "", provider: "password", created_at: nowIso() });
  },
  async findUserByEmail(email) { return (await backend()).findUserByEmail(email); },
  async findUserById(id) { return (await backend()).findUserById(id); },
  async getProfile(userId) { return (await backend()).getProfile(userId); },
  async upsertProfile(userId, fields) {
    return (await backend()).upsertProfile({ user_id: userId, company: "", region: "", branche: "", stage: "", website: "", founders: "", ...fields, updated_at: nowIso() });
  },
  async createPitch(userId, { projektname, pitch_text, analysis }) {
    return (await backend()).createPitch({ id: newId(), user_id: userId, projektname: projektname || "", pitch_text: pitch_text || "", analysis_json: JSON.stringify(analysis || {}), created_at: nowIso() });
  },
  async listPitches(userId) { return (await backend()).listPitches(userId); },
  async getPitch(id, userId) {
    const p = await (await backend()).getPitch(id, userId);
    if (!p) return null;
    let analysis = {}; try { analysis = JSON.parse(p.analysis_json || "{}"); } catch {}
    const antraege = await (await backend()).listAntraege(id, userId);
    return { id: p.id, projektname: p.projektname, pitch_text: p.pitch_text, created_at: p.created_at, analysis, antraege };
  },
  async deletePitch(id, userId) { return (await backend()).deletePitch(id, userId); },
  async createAntrag(userId, { pitch_id, grant_id, grant_name, content }) {
    return (await backend()).createAntrag({ id: newId(), user_id: userId, pitch_id: pitch_id || null, grant_id: grant_id || "", grant_name: grant_name || "", content: content || "", created_at: nowIso() });
  },
};
