import { FLAGGER_SCORING_ARTIFACT_VERSION_MAX_LENGTH } from "@domain/scores"

const fnv1a32 = (value: string): string => {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, "0")
}

// Digest rather than truncate: a cut-off identity would let two judges share a label.
export const buildJudgmentVersion = (
  prefix: string,
  judge: { readonly provider: string; readonly model: string },
): string => {
  const readable = `${prefix}:${judge.provider}/${judge.model}`
  if (readable.length <= FLAGGER_SCORING_ARTIFACT_VERSION_MAX_LENGTH) return readable
  return `${prefix}:h:${fnv1a32(readable)}`
}
