import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { InvoiceDocumentLine } from "@/lib/types";

const PAGE_WIDTH = 612; // US Letter, points
const PAGE_HEIGHT = 792;
const MARGIN_X = 54;
const LINE_HEIGHT = 16;

const FONT_SIZE_BY_KIND: Record<InvoiceDocumentLine["kind"], number> = {
  header: 13,
  meta: 10,
  "table-header": 9,
  "line-item": 10,
  totals: 10,
  notes: 10,
  footer: 8,
};

/**
 * Renders a scenario's document lines to a real one-page PDF with an actual
 * embedded text layer — this is what makes deterministic evidence alignment
 * (pdf-text-layer.ts) and Claude's native PDF extraction possible at all.
 * Each documentLine becomes exactly one PDF text-showing operation, which is
 * what lets pdf-text-layer.ts read it back as one line-level token later.
 */
export async function generateInvoicePdf(lines: InvoiceDocumentLine[]): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = PAGE_HEIGHT - 60;

  for (const line of lines) {
    const size = FONT_SIZE_BY_KIND[line.kind];
    const font = line.kind === "header" ? bold : regular;
    const maxWidth = PAGE_WIDTH - MARGIN_X * 2;

    for (const wrapped of wrapText(line.text, font, size, maxWidth)) {
      page.drawText(wrapped, {
        x: MARGIN_X,
        y,
        size,
        font,
        color: rgb(0.1, 0.1, 0.1),
      });
      y -= LINE_HEIGHT;
    }

    if (line.kind === "header" || line.kind === "table-header") {
      y -= 4; // a little breathing room after section-ish lines
    }
  }

  return pdfDoc.save();
}

function wrapText(text: string, font: { widthOfTextAtSize(t: string, s: number): number }, size: number, maxWidth: number): string[] {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return [text];

  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}
