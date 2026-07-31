const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
  0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
  0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
  0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
])

const rotr = (value: number, bits: number): number => (value >>> bits) | (value << (32 - bits))

/**
 * Synchronous SHA-256 over raw bytes.
 *
 * `crypto.subtle.digest` is the right default and is what {@link hash} uses, but it is asynchronous. This
 * exists for the one caller that cannot await: the PII redaction walk is synchronous, runs per string leaf
 * on the ingest path, and needs a digest to check the checksum embedded in a Bitcoin address.
 *
 * Pure TypeScript rather than `node:crypto`, so this module stays loadable in a browser bundle like the rest
 * of `@repo/utils`. Prefer {@link hash} anywhere an `Effect` is already in play.
 */
export function sha256Bytes(input: Uint8Array): Uint8Array {
  const state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ])

  // One 0x80 byte, then zeroes, then the length in bits as a big-endian 64-bit integer.
  const blockCount = Math.floor((input.length + 8) / 64) + 1
  const padded = new Uint8Array(blockCount * 64)
  padded.set(input)
  padded[input.length] = 0x80
  const bitLength = input.length * 8
  const view = new DataView(padded.buffer)
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000))
  view.setUint32(padded.length - 4, bitLength >>> 0)

  const schedule = new Uint32Array(64)

  for (let block = 0; block < blockCount; block++) {
    const offset = block * 64
    for (let index = 0; index < 16; index++) schedule[index] = view.getUint32(offset + index * 4)
    for (let index = 16; index < 64; index++) {
      const a = schedule[index - 15] as number
      const b = schedule[index - 2] as number
      const s0 = rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3)
      const s1 = rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10)
      schedule[index] = ((schedule[index - 16] as number) + s0 + (schedule[index - 7] as number) + s1) | 0
    }

    let h0 = state[0] as number
    let h1 = state[1] as number
    let h2 = state[2] as number
    let h3 = state[3] as number
    let h4 = state[4] as number
    let h5 = state[5] as number
    let h6 = state[6] as number
    let h7 = state[7] as number

    for (let index = 0; index < 64; index++) {
      const s1 = rotr(h4, 6) ^ rotr(h4, 11) ^ rotr(h4, 25)
      const choose = (h4 & h5) ^ (~h4 & h6)
      const temp1 = (h7 + s1 + choose + (K[index] as number) + (schedule[index] as number)) | 0
      const s0 = rotr(h0, 2) ^ rotr(h0, 13) ^ rotr(h0, 22)
      const majority = (h0 & h1) ^ (h0 & h2) ^ (h1 & h2)
      const temp2 = (s0 + majority) | 0

      h7 = h6
      h6 = h5
      h5 = h4
      h4 = (h3 + temp1) | 0
      h3 = h2
      h2 = h1
      h1 = h0
      h0 = (temp1 + temp2) | 0
    }

    state[0] = ((state[0] as number) + h0) | 0
    state[1] = ((state[1] as number) + h1) | 0
    state[2] = ((state[2] as number) + h2) | 0
    state[3] = ((state[3] as number) + h3) | 0
    state[4] = ((state[4] as number) + h4) | 0
    state[5] = ((state[5] as number) + h5) | 0
    state[6] = ((state[6] as number) + h6) | 0
    state[7] = ((state[7] as number) + h7) | 0
  }

  const digest = new Uint8Array(32)
  const digestView = new DataView(digest.buffer)
  for (let index = 0; index < 8; index++) digestView.setUint32(index * 4, state[index] as number)

  return digest
}
