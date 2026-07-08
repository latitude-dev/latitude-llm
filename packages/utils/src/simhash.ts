const FNV_OFFSET_BASIS_64 = 0xcbf29ce484222325n
const FNV_PRIME_64 = 0x100000001b3n
const MASK_64 = 0xffffffffffffffffn
const SIMHASH_BITS = 64

function fnv1a64(text: string): bigint {
  let digest = FNV_OFFSET_BASIS_64
  for (let i = 0; i < text.length; i++) {
    digest ^= BigInt(text.charCodeAt(i))
    digest = (digest * FNV_PRIME_64) & MASK_64
  }
  return digest
}

function buildShingles(tokens: readonly string[]): string[] {
  if (tokens.length < 3) return [tokens.join(" ")]

  const shingles: string[] = []
  for (let i = 0; i <= tokens.length - 3; i++) {
    shingles.push(tokens.slice(i, i + 3).join(" "))
  }
  return shingles
}

/** 64-bit SimHash over lowercased whitespace-tokenized word 3-shingles, hashed with FNV-1a 64-bit. */
export function simhash64(text: string): bigint {
  const tokens = text.toLowerCase().split(/\s+/).filter(Boolean)
  const shingles = buildShingles(tokens)

  const bitVotes = new Array<number>(SIMHASH_BITS).fill(0)
  for (const shingle of shingles) {
    const digest = fnv1a64(shingle)
    for (let bit = 0; bit < SIMHASH_BITS; bit++) {
      const isSet = (digest & (1n << BigInt(bit))) !== 0n
      bitVotes[bit] = (bitVotes[bit] ?? 0) + (isSet ? 1 : -1)
    }
  }

  let sketch = 0n
  for (let bit = 0; bit < SIMHASH_BITS; bit++) {
    if ((bitVotes[bit] ?? 0) > 0) sketch |= 1n << BigInt(bit)
  }
  return sketch
}

export function hammingDistance64(a: bigint, b: bigint): number {
  let diff = (a ^ b) & MASK_64
  let distance = 0
  while (diff !== 0n) {
    diff &= diff - 1n
    distance++
  }
  return distance
}
