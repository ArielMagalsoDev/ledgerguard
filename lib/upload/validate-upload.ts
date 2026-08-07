// Upload sandbox — public-boundary file validation. Runs entirely before
// any model call: rejecting bad input here is what keeps the daily spend
// cap and the extraction pipeline from ever seeing a hostile or useless
// file. See CLAUDE.md section 14 and ledgerguard.md's "Security and privacy
// requirements" for the checklist this implements.
import { extractTextLayer } from "@/lib/extraction/pdf-text-layer";
import { loadPdfjs } from "@/lib/extraction/pdfjs-runtime";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_PDF_PAGES = 4;
// A born-digital invoice PDF has dozens of short text items per page (every
// word/number is its own item in pdfjs's text content stream). A scanned
// PDF with no embedded text layer has zero. This threshold is deliberately
// low — it exists to separate "has a real text layer" from "doesn't", not
// to judge extraction quality (that's the model/alignment pipeline's job).
const MIN_TEXT_ITEMS_PER_PAGE = 5;

export type UploadValidationError =
  | "file_too_large"
  | "not_a_pdf"
  | "encrypted_pdf"
  | "malformed_pdf"
  | "too_many_pages"
  | "no_text_layer";

export type UploadValidationResult =
  | { ok: true; pageCount: number }
  | { ok: false; error: UploadValidationError; message: string };

const ERROR_MESSAGES: Record<UploadValidationError, string> = {
  file_too_large: `File exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB limit for the upload sandbox.`,
  not_a_pdf: "This doesn't look like a PDF — the file's own bytes don't start with the PDF signature, regardless of its filename or extension.",
  encrypted_pdf: "This PDF is password-protected or encrypted. The upload sandbox can't open it.",
  malformed_pdf: "This PDF couldn't be parsed — it may be corrupted or use a format Ledger Guard's demo doesn't support.",
  too_many_pages: `This PDF has more than ${MAX_PDF_PAGES} pages. The upload sandbox is scoped to short invoices.`,
  no_text_layer:
    "This looks like a scanned or image-based document. Ledger Guard's public demo verifies every extracted value against the PDF's embedded text layer, and this file doesn't have one. OCR support is on the roadmap — try one of the seeded scenarios instead, or upload a digitally-generated PDF invoice.",
};

function fail(error: UploadValidationError): UploadValidationResult {
  return { ok: false, error, message: ERROR_MESSAGES[error] };
}

/**
 * Full validation chain for an uploaded file, in the order CLAUDE.md
 * section 14 and the upload-sandbox plan require: size → real magic bytes
 * (never trust the filename or browser-reported MIME type) → parseable and
 * unencrypted → page count → text-layer density. Every check runs before
 * this function returns, so a caller only ever sees one of: an accepted
 * result with the page count, or the single most relevant rejection reason.
 */
export async function validateUpload(bytes: Uint8Array): Promise<UploadValidationResult> {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_UPLOAD_BYTES) {
    return fail("file_too_large");
  }

  // Real magic-byte check — "%PDF-" — not the browser's File.type, which is
  // attacker-controlled and just an extension-based guess.
  const header = Buffer.from(bytes.slice(0, 5)).toString("latin1");
  if (header !== "%PDF-") {
    return fail("not_a_pdf");
  }

  let pageCount: number;
  try {
    const pdfjsLib = await loadPdfjs();
    // pdfjs's `data` option takes ownership of the buffer it's given and
    // detaches it (byteLength drops to 0 on every reference to the same
    // underlying ArrayBuffer, caller included) — pass a copy, not `bytes`
    // itself, since this function reuses `bytes` again below for the
    // text-layer check, and the caller reuses it again after this function
    // returns (hashing, storage upload).
    const loadingTask = pdfjsLib.getDocument({ data: bytes.slice() });
    const pdf = await loadingTask.promise;
    pageCount = pdf.numPages;
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "PasswordException") return fail("encrypted_pdf");
    return fail("malformed_pdf");
  }

  if (pageCount > MAX_PDF_PAGES) {
    return fail("too_many_pages");
  }

  // Text-layer density: reuse the exact deterministic reader the extraction
  // pipeline itself relies on (pdf-text-layer.ts) — if that finds nothing
  // real for this file, extraction and evidence alignment wouldn't either.
  let textItemCount: number;
  try {
    const lines = await extractTextLayer(bytes);
    textItemCount = lines.length;
  } catch {
    return fail("malformed_pdf");
  }

  if (textItemCount < MIN_TEXT_ITEMS_PER_PAGE * pageCount) {
    return fail("no_text_layer");
  }

  return { ok: true, pageCount };
}
