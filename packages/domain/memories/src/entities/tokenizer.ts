import { getEncoding, type Tiktoken } from "js-tiktoken"

// Lazily loaded so importing this module (e.g. transitively for types) doesn't
// pull the o200k_base ranks into memory until a token count is actually needed.
let encoder: Tiktoken | null = null

/** Approximate token count of a body using the o200k_base encoding ([D5]). */
export const countTokens = (body: string): number => {
  if (encoder === null) encoder = getEncoding("o200k_base")
  return encoder.encode(body).length
}
