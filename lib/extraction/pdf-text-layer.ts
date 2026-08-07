import { loadPdfjs, STANDARD_FONT_DATA_URL } from "@/lib/extraction/pdfjs-runtime";

export type TextLayerLine = {
  page: number; // 1-based
  text: string;
  box: [number, number, number, number]; // [x0,y0,x1,y1], normalized 0-1, top-left origin
};

/**
 * Reads the real text layer out of a PDF — page, string, and position for
 * every text-showing operation. This is the deterministic ground truth that
 * align-evidence.ts checks extracted values against. The model never gets to
 * report its own coordinates (CLAUDE.md section 10).
 */
export async function extractTextLayer(pdfBytes: Uint8Array): Promise<TextLayerLine[]> {
  const pdfjsLib = await loadPdfjs();
  // pdfjs's `data` option takes ownership of the buffer it's given and
  // detaches it (byteLength drops to 0 on every reference to the same
  // underlying ArrayBuffer, caller included) — pass a copy, never
  // `pdfBytes` itself, so callers can safely reuse their own buffer
  // afterward (the upload sandbox's validateUpload does exactly that, and
  // this was silently unsafe for every existing caller too, just never hit
  // because none of them happened to reuse the buffer after this call).
  const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice(), standardFontDataUrl: STANDARD_FONT_DATA_URL });
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
