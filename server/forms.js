// Ausfüllbare PDF-Formulare (AcroForm) lesen und befüllen.
import { PDFDocument } from "pdf-lib";

export async function readFields(buffer) {
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const form = doc.getForm();
  return form.getFields().map((f) => ({ name: f.getName(), type: f.constructor.name }));
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
      else if (t === "PDFDropdown" || t === "PDFOptionList" || t === "PDFRadioGroup") { f.select(String(v)); filled++; }
    } catch { /* Feld überspringen */ }
  }
  try { form.updateFieldAppearances(); } catch {}
  const bytes = await doc.save();
  return { buffer: Buffer.from(bytes), filled };
}
