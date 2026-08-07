import path from "node:path";
import { pathToFileURL } from "node:url";

export type TextLayerLine = {
  page: number; // 1-based
  text: string;
  box: [number, number, number, number]; // [x0,y0,x1,y1], normalized 0-1, top-left origin
};

// pdfjs falls back to its bundled standard (non-embedded) fonts when a PDF
// references a font it doesn't embed. Our PDFs (pdf-generate.ts) always
// embed their own fonts, so this path is never actually exercised — but
// without pointing pdfjs at the fonts it ships in its own package, it prints
// a `standardFontDataUrl` warning to stderr on every extraction. Silenced by
// pointing at the copy already sitting in node_modules.
const STANDARD_FONT_DATA_URL = pathToFileURL(
  path.join(process.cwd(), "node_modules/pdfjs-dist/standard_fonts/")
).href;

/**
 * Reads the real text layer out of a PDF — page, string, and position for
 * every text-showing operation. This is the deterministic ground truth that
 * align-evidence.ts checks extracted values against. The model never gets to
 * report its own coordinates (CLAUDE.md section 10).
 */
export async function extractTextLayer(pdfBytes: Uint8Array): Promise<TextLayerLine[]> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjsLib.getDocument({ data: pdfBytes, standardFontDataUrl: STANDARD_FONT_DATA_URL });
  const pdf = await loadingTask.promise;

  const lines: TextLayerLine[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();

    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const [, , , , e, f] = item.transform as number[];
      const width = item.width ?? 0;
      const height = item.height ?? 10;

      const pdfTop = f + height;
      const pdfBottom = f;
      const x0 = clamp01(e / viewport.width);
      const x1 = clamp01((e + width) / viewport.width);
      const y0 = clamp01((viewport.height - pdfTop) / viewport.height);
      const y1 = clamp01((viewport.height - pdfBottom) / viewport.height);

      lines.push({ page: pageNum, text: item.str, box: [x0, y0, x1, y1] });
    }
  }

  return lines;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
