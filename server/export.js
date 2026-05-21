// Markdown → DOCX (Word). Pragmatischer Konverter für die von Nomos erzeugten
// Antragsentwürfe: Überschriften, Absätze, Aufzählungen, **fett**, Tabellen.
import { Document, Packer, Paragraph, HeadingLevel, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle } from "docx";

// "Text mit **fett**" → TextRun[]
function runs(text) {
  const parts = String(text).split(/\*\*/);
  return parts.map((p, i) => new TextRun({ text: p, bold: i % 2 === 1 }));
}

function cell(text) {
  return new TableCell({
    width: { size: 0, type: WidthType.AUTO },
    children: [new Paragraph({ children: runs(text.trim()) })],
  });
}

function isTableRow(line) { return /^\s*\|.*\|\s*$/.test(line); }
function isSeparator(line) { return /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes("-"); }
function splitRow(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

export async function buildDocx(markdown, title) {
  const lines = String(markdown || "").replace(/\r/g, "").split("\n");
  const children = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Tabelle: zusammenhängende |…|-Zeilen
    if (isTableRow(line)) {
      const block = [];
      while (i < lines.length && isTableRow(lines[i])) { block.push(lines[i]); i++; }
      const rows = block.filter((l) => !isSeparator(l)).map(splitRow);
      if (rows.length) {
        children.push(new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: rows.map((cells, r) => new TableRow({
            tableHeader: r === 0,
            children: cells.map((c) => cell(r === 0 ? `**${c}**` : c)),
          })),
        }));
        children.push(new Paragraph({ text: "" }));
      }
      continue;
    }

    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      children.push(new Paragraph({
        children: runs(h[2]),
        heading: level === 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
        spacing: { before: 200, after: 80 },
      }));
      i++; continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      children.push(new Paragraph({ children: runs(bullet[1]), bullet: { level: 0 } }));
      i++; continue;
    }

    if (line.trim() === "") { i++; continue; }

    children.push(new Paragraph({ children: runs(line), spacing: { after: 120 } }));
    i++;
  }

  if (!children.length) children.push(new Paragraph({ text: "" }));

  const doc = new Document({
    creator: "Telos · Nomos",
    title: title || "Förderantrag",
    sections: [{ properties: {}, children }],
  });
  return Packer.toBuffer(doc);
}
