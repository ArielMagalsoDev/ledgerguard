import type { ExtractedField, ExtractedInvoice, FieldStatus, InvoiceLineItem } from "@/lib/types";
import type { RawExtraction, RawField } from "@/lib/extraction/schema";
import type { TextLayerLine } from "@/lib/extraction/pdf-text-layer";

type Haystack = {
  text: string;
  page: number;
  box: [number, number, number, number];
};

/**
 * Two search tiers: individual text-layer lines, and consecutive same-page
 * pairs concatenated. Pairs exist only to recover a quote that fell across a
 * PDF line-wrap boundary (see pdf-generate.ts's wrapText) — they must stay a
 * strict fallback, searched only when no single line matches. Searching both
 * tiers together is wrong: any quote that is a prefix of line N will also
 * match the (N, N+1) pair, producing two different boxes for one true match
 * and a false "conflicting" status.
 */
function buildHaystacks(textLayer: TextLayerLine[]): { singles: Haystack[]; pairs: Haystack[] } {
  const singles: Haystack[] = textLayer.map((l) => ({ text: l.text, page: l.page, box: l.box }));
  const pairs: Haystack[] = [];

  for (let i = 0; i < textLayer.length - 1; i++) {
    const a = textLayer[i];
    const b = textLayer[i + 1];
    if (a.page !== b.page) continue;
    pairs.push({
      text: `${a.text} ${b.text}`,
      page: a.page,
      box: unionBox(a.box, b.box),
    });
  }

  return { singles, pairs };
}

function unionBox(
  a: [number, number, number, number],
  b: [number, number, number, number]
): [number, number, number, number] {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * The hallucination guard closes one gap short of complete without this: the
 * wrap-boundary `pairs` tier below exists to recover a quote split across a
 * genuine word-wrap, but nothing stopped the model from citing a "quote"
 * that's really two adjacent-but-unrelated lines glued together — e.g.
 * quoting "Subtotal: $450.00 Sales Tax (8%): $36.00" as if it supported a
 * `total` field, when $486.00 (the value actually being claimed) never
 * appears anywhere in that quote at all. Found by evals/run.ts's held-out
 * split (an "ambiguous scan" case with no printed "Total Due" line):
 * extraction confidently computed subtotal+tax, cited the two source lines
 * as "evidence" for total, and — because that concatenation happened to
 * exist in the pairs haystack — the field came back "verified". A real
 * false clearance, not a test artifact. This check is deliberately cheap:
 * if the model's own value isn't even present in its own quote, the quote
 * cannot be real evidence for it, independent of whether it's found in the
 * document at all.
 */
function valueAppearsInQuote(value: string, quote: string): boolean {
  const strip = (s: string) => s.replace(/[,$]/g, "");
  return strip(quote).includes(strip(value));
}

function searchTier(quote: string, haystacks: Haystack[]): Haystack[] {
  const exact = haystacks.filter((h) => h.text.includes(quote));
  if (exact.length > 0) return exact;

  const lowerQuote = quote.toLowerCase();
  const caseInsensitive = haystacks.filter((h) => h.text.toLowerCase().includes(lowerQuote));
  if (caseInsensitive.length > 0) return caseInsensitive;

  const normalizedQuote = normalizeWhitespace(quote);
  return haystacks.filter((h) => normalizeWhitespace(h.text).includes(normalizedQuote));
}

/** Searches single lines first; only consults wrap-boundary pairs if nothing matched. */
function findMatches(quote: string, tiers: { singles: Haystack[]; pairs: Haystack[] }): Haystack[] {
  const singleMatches = searchTier(quote, tiers.singles);
  if (singleMatches.length > 0) return singleMatches;
  return searchTier(quote, tiers.pairs);
}

/**
 * Aligns one raw field against the real document text layer. This is the
 * hallucination guard: a value is only ever "verified" when its claimed
 * quote is independently found in the document. A value with no findable
 * quote — whether the model omitted one or the quote simply isn't there —
 * drops to "uncertain" and cannot pass a required-field control downstream.
 */
export function alignField(
  raw: RawField,
  fieldName: string,
  haystacks: { singles: Haystack[]; pairs: Haystack[] },
  normalize?: (v: string) => string
): ExtractedField<string> {
  if (raw.value == null) {
    return { field: fieldName, value: null, confidence: 0, status: "missing", evidence: [] };
  }

  if (raw.quote == null || !valueAppearsInQuote(raw.value, raw.quote)) {
    return {
      field: fieldName,
      value: raw.value,
      normalizedValue: normalize?.(raw.value),
      confidence: 0.3,
      status: "uncertain",
      evidence: [],
    };
  }

  const matches = findMatches(raw.quote, haystacks);

  if (matches.length === 0) {
    return {
      field: fieldName,
      value: raw.value,
      normalizedValue: normalize?.(raw.value),
      confidence: 0.35,
      status: "uncertain",
      evidence: [],
    };
  }

  const uniqueBoxes = new Set(matches.map((m) => m.box.join(",")));
  const status: FieldStatus = uniqueBoxes.size > 1 ? "conflicting" : "verified";

  return {
    field: fieldName,
    value: raw.value,
    normalizedValue: normalize?.(raw.value),
    confidence: status === "verified" ? 0.97 : 0.5,
    status,
    evidence: matches.slice(0, uniqueBoxes.size > 1 ? matches.length : 1).map((m) => ({
      page: m.page,
      text: raw.quote as string,
      boundingBox: m.box,
    })),
  };
}

const normalizeAlnum = (v: string) => v.toUpperCase().replace(/[^0-9A-Z]/g, "");

export function alignExtraction(raw: RawExtraction, textLayer: TextLayerLine[]): ExtractedInvoice {
  const haystacks = buildHaystacks(textLayer);
  const field = (f: RawField, name: string, normalize?: (v: string) => string) =>
    alignField(f, name, haystacks, normalize);

  const lineItems: InvoiceLineItem[] = raw.lineItems.map((li) => ({
    lineNumber: li.lineNumber,
    description: field(li.description, "description"),
    quantity: field(li.quantity, "quantity"),
    unitPrice: field(li.unitPrice, "unitPrice"),
    lineTotal: field(li.lineTotal, "lineTotal"),
  }));

  return {
    invoiceNumber: field(raw.invoiceNumber, "invoiceNumber", normalizeAlnum),
    invoiceDate: field(raw.invoiceDate, "invoiceDate"),
    dueDate: field(raw.dueDate, "dueDate"),
    supplierName: field(raw.supplierName, "supplierName"),
    supplierTaxId: field(raw.supplierTaxId, "supplierTaxId", normalizeAlnum),
    purchaseOrderNumber: field(raw.purchaseOrderNumber, "purchaseOrderNumber", normalizeAlnum),
    currency: field(raw.currency, "currency"),
    subtotal: field(raw.subtotal, "subtotal"),
    tax: field(raw.tax, "tax"),
    total: field(raw.total, "total"),
    remittanceDetails: field(raw.remittanceDetails, "remittanceDetails"),
    notes: field(raw.notes, "notes"),
    lineItems,
  };
}
