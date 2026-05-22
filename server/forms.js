// Ausfüllbare PDF-Formulare (AcroForm) lesen und befüllen.
import { PDFDocument } from "pdf-lib";

const CHOICE_TYPES = new Set(["PDFDropdown", "PDFOptionList", "PDFRadioGroup"]);

function fieldOptions(f) {
  const t = f.constructor.name;
  if (CHOICE_TYPES.has(t)) {
    try { return f.getOptions().map(String); } catch { return []; }
  }
  if (t === "PDFCheckBox") return ["Ja", "Nein"];
  return [];
}

export async function readFields(buffer) {
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const form = doc.getForm();
  return form.getFields().map((f) => ({ name: f.getName(), type: f.constructor.name, options: fieldOptions(f) }));
}

// Synonyme → erkennen, welche der real vorhandenen Optionen gemeint ist.
const SYNONYMS = {
  herr: ["herr", "männlich", "maennlich", "mann", "male", "m", "divers/männlich"],
  frau: ["frau", "weiblich", "weibl", "female", "f", "w"],
};
function normalizeChoice(value, options) {
  const v = String(value).trim();
  if (!options.length) return v; // keine Liste bekannt → 1:1
  const lc = v.toLowerCase();
  // 1) exakter Treffer
  let hit = options.find((o) => o === v);
  if (hit) return hit;
  // 2) case-insensitiv
  hit = options.find((o) => o.toLowerCase() === lc);
  if (hit) return hit;
  // 3) Synonym-Gruppen (Anrede/Geschlecht)
  for (const group of Object.values(SYNONYMS)) {
    if (group.includes(lc)) {
      hit = options.find((o) => group.includes(o.toLowerCase()));
      if (hit) return hit;
    }
  }
  // 4) Teil-Treffer (z. B. "Ja, ich stimme zu" ↔ "Ja")
  hit = options.find((o) => o.toLowerCase().startsWith(lc) || lc.startsWith(o.toLowerCase()));
  return hit || null; // null → nicht setzen statt falsch raten
}

export async function fillFields(buffer, values) {
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const form = doc.getForm();
  let filled = 0;
  for (const f of form.getFields()) {
    const v = values[f.getName()];
    if (v == null || v === "") continue;
    const t = f.constructor.name;
    try {
      if (t === "PDFTextField") { f.setText(String(v)); filled++; }
      else if (t === "PDFCheckBox") { /^(true|ja|yes|x|1|on)$/i.test(String(v)) ? f.check() : f.uncheck(); filled++; }
      else if (CHOICE_TYPES.has(t)) {
        const choice = normalizeChoice(v, fieldOptions(f));
        if (choice != null) { f.select(choice); filled++; }
      }
    } catch { /* Feld überspringen */ }
  }
  try { form.updateFieldAppearances(); } catch {}
  const bytes = await doc.save();
  return { buffer: Buffer.from(bytes), filled };
}
