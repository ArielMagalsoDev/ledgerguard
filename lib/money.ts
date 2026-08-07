// Decimal-safe money handling. Never JavaScript floats for currency math —
// everything here operates in integer cents.

const DECIMAL_STRING = /^-?\d+(\.\d{1,2})?$/;

/**
 * Parses a decimal string ("842.40", "0", "-12.5") into integer cents.
 * Returns null for anything that isn't a strict decimal string — no
 * coercion, no locale parsing, no stripping of currency symbols.
 */
export function parseDecimalToCents(value: string | null | undefined): number | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!DECIMAL_STRING.test(trimmed)) return null;

  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [wholePart, fractionPart = ""] = unsigned.split(".");
  const cents = Number(wholePart) * 100 + Number(fractionPart.padEnd(2, "0"));
  return negative ? -cents : cents;
}

export function centsToDecimalString(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const wholePart = Math.floor(abs / 100);
  const fractionPart = String(abs % 100).padStart(2, "0");
  return `${negative ? "-" : ""}${wholePart}.${fractionPart}`;
}

export function addCents(...values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0);
}

export function centsDiff(a: number, b: number): number {
  return Math.abs(a - b);
}
