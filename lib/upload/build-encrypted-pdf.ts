import { createHash } from "node:crypto";

// A genuinely password-protected PDF for the Phase 4 abuse-test corpus —
// not mocked. pdf-lib (this repo's PDF writer) has no encryption support, so
// this hand-implements the PDF standard security handler (ISO 32000-1
// section 7.6.3, revision 2 / 40-bit RC4) directly against Node's crypto,
// the same algorithm any conforming PDF reader implements. The user
// password is real and non-empty, so opening it genuinely requires a
// password — pdfjs correctly throws PasswordException on it, which is what
// validate-upload.ts's encrypted_pdf branch exists to catch.
const PAD = Buffer.from([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08,
  0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
]);

function padPassword(password: string): Buffer {
  const bytes = Buffer.from(password, "latin1").subarray(0, 32);
  return Buffer.concat([bytes, PAD], 32);
}

// Node's OpenSSL 3 default provider has RC4 disabled (it's the same cipher
// the PDF standard security handler mandates for R2/40-bit, so there's no
// substituting a different one) — implemented directly instead. RC4 is a
// simple byte-oriented stream cipher, ~15 lines, no external dependency.
function rc4(key: Buffer, data: Buffer): Buffer {
  const s = Uint8Array.from({ length: 256 }, (_, i) => i);
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + key[i % key.length]) & 0xff;
    [s[i], s[j]] = [s[j], s[i]];
  }
  const out = Buffer.alloc(data.length);
  let i = 0;
  j = 0;
  for (let n = 0; n < data.length; n++) {
    i = (i + 1) & 0xff;
    j = (j + s[i]) & 0xff;
    [s[i], s[j]] = [s[j], s[i]];
    out[n] = data[n] ^ s[(s[i] + s[j]) & 0xff];
  }
  return out;
}

function computeOwnerEntry(ownerPassword: string, userPassword: string): Buffer {
  const key = createHash("md5").update(padPassword(ownerPassword)).digest().subarray(0, 5);
  return rc4(key, padPassword(userPassword));
}

function computeEncryptionKey(userPassword: string, ownerEntry: Buffer, permissions: number, fileId: Buffer): Buffer {
  const pBytes = Buffer.alloc(4);
  pBytes.writeInt32LE(permissions, 0);
  const input = Buffer.concat([padPassword(userPassword), ownerEntry, pBytes, fileId]);
  return createHash("md5").update(input).digest().subarray(0, 5);
}

function computeUserEntry(encryptionKey: Buffer): Buffer {
  return rc4(encryptionKey, PAD);
}

function toPdfLiteralString(bytes: Buffer): string {
  let out = "";
  for (const b of bytes) {
    if (b === 0x28 || b === 0x29 || b === 0x5c) out += `\\${String.fromCharCode(b)}`;
    else if (b < 0x20 || b > 0x7e) out += `\\${b.toString(8).padStart(3, "0")}`;
    else out += String.fromCharCode(b);
  }
  return out;
}

/**
 * Builds a minimal, structurally valid, genuinely password-protected PDF.
 * `userPassword` is required to open it at all — a real reader (pdfjs
 * included) must reject the empty-password default and throw
 * PasswordException, exactly like a real encrypted invoice scan would.
 */
export function buildEncryptedPdf(userPassword: string, ownerPassword = "owner-pass"): Uint8Array {
  const fileId = Buffer.from("0123456789abcdef", "latin1");
  const permissions = -44; // arbitrary restrictive value; irrelevant to the password check itself
  const ownerEntry = computeOwnerEntry(ownerPassword, userPassword);
  const encryptionKey = computeEncryptionKey(userPassword, ownerEntry, permissions, fileId);
  const userEntry = computeUserEntry(encryptionKey);

  const objects = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<<>>>>",
    `<</Filter/Standard/V 1/R 2/O(${toPdfLiteralString(ownerEntry)})/U(${toPdfLiteralString(userEntry)})/P ${permissions}>>`,
  ];

  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${i + 1} 0 obj${obj}endobj\n`;
  });

  const xrefOffset = Buffer.byteLength(body, "latin1");
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    xref += `${off.toString().padStart(10, "0")} 00000 n \n`;
  }
  const trailer =
    `trailer<</Size ${objects.length + 1}/Root 1 0 R/Encrypt 4 0 R/ID[<${fileId.toString("hex")}><${fileId.toString("hex")}>]>>\n` +
    `startxref\n${xrefOffset}\n%%EOF`;

  return new TextEncoder().encode(body + xref + trailer);
}
