// Auth ohne externe Abhängigkeiten: Passwort-Hashing via scrypt, Session als
// signiertes httpOnly-Cookie (HMAC). Struktur offen für spätere OAuth-Provider.
import crypto from "node:crypto";
import { repo } from "./db.js";

const COOKIE = "nomos_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 Tage
const SECRET = process.env.SESSION_SECRET || "dev-only-insecure-secret-change-me";
if (!process.env.SESSION_SECRET) {
  console.warn("[Nomos] WARN: SESSION_SECRET nicht gesetzt — für Produktion unbedingt setzen.");
}

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pw, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}
export function verifyPassword(pw, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const calc = crypto.scryptSync(pw, salt, 64);
  const orig = Buffer.from(hash, "hex");
  return orig.length === calc.length && crypto.timingSafeEqual(orig, calc);
}

const b64u = (s) => Buffer.from(s).toString("base64url");
function sign(userId) {
  const sig = crypto.createHmac("sha256", SECRET).update(userId).digest("base64url");
  return `${b64u(userId)}.${sig}`;
}
function verify(token) {
  if (!token || !token.includes(".")) return null;
  const [idB64, sig] = token.split(".");
  let userId; try { userId = Buffer.from(idB64, "base64url").toString(); } catch { return null; }
  const expected = crypto.createHmac("sha256", SECRET).update(userId).digest("base64url");
  const a = Buffer.from(sig); const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? userId : null;
}

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || "").split(";").forEach((c) => {
    const i = c.indexOf("="); if (i < 0) return;
    out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim());
  });
  return out;
}

export function setSession(res, userId) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${COOKIE}=${sign(userId)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}${secure}`);
}
export function clearSession(res) {
  res.setHeader("Set-Cookie", `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}
export function sessionUserId(req) { return verify(parseCookies(req)[COOKIE]); }

export async function currentUser(req) {
  const id = sessionUserId(req);
  if (!id) return null;
  return repo.findUserById(id);
}

// Middleware: hängt req.user an, wenn eingeloggt.
export async function attachUser(req, _res, next) {
  try { req.user = await currentUser(req); } catch { req.user = null; }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Bitte einloggen." });
  next();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function validEmail(e) { return typeof e === "string" && EMAIL_RE.test(e); }

export function publicUser(u) { return u ? { id: u.id, email: u.email, name: u.name || "" } : null; }
