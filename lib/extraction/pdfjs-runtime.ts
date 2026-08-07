import path from "node:path";
import { pathToFileURL } from "node:url";

// Shared pdfjs-dist loader for every server-side PDF read (pdf-text-layer.ts,
// the upload sandbox's validate-upload.ts). pdfjs tries to set up a worker
// on first use; in a plain `tsx` script (the only context this code ran in
// before the upload sandbox) Node resolves that worker module directly from
// node_modules and it just works. Bundled inside a real Next.js API route
// (Turbopack), the dynamic import path gets rewritten to a bundle chunk
// location that doesn't contain the separate worker file, and pdfjs's
// "fake worker" fallback throws: `Setting up fake worker failed: "Cannot
// find module '.../.next/dev/server/chunks/pdf.worker.mjs'"`. Pointing
// GlobalWorkerOptions.workerSrc at the real on-disk file (same
// filesystem-path-not-bundler-import technique already used for
// STANDARD_FONT_DATA_URL below) sidesteps Turbopack's resolution entirely.
const WORKER_SRC_URL = pathToFileURL(
  path.join(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs")
).href;

export const STANDARD_FONT_DATA_URL = pathToFileURL(
  path.join(process.cwd(), "node_modules/pdfjs-dist/standard_fonts/")
).href;

let cached: typeof import("pdfjs-dist/legacy/build/pdf.mjs") | null = null;

export async function loadPdfjs() {
  if (cached) return cached;
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_SRC_URL;
  cached = pdfjsLib;
  return pdfjsLib;
}
