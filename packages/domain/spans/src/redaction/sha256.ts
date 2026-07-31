import { createHash } from "node:crypto"

/**
 * `node:crypto` rather than `crypto.subtle`, against the web-standards-first rule for this layer, because
 * the redaction walk is synchronous and `crypto.subtle.digest` only has an async form. Redaction is reached
 * from the package's server entry alone — `browser.ts` does not export it — so nothing here ships to a
 * browser bundle.
 */
export const sha256Bytes = (input: Uint8Array): Uint8Array =>
  new Uint8Array(createHash("sha256").update(input).digest())
