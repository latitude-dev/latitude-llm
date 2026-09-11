import { FLAGGER_SCORING_ARTIFACT_VERSION_MAX_LENGTH } from "@domain/scores"

const fnv1a32 = (value: string): string => {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, "0")
}

/**
 * Identifies the prompt, result schema, and judge configuration behind a
 * persisted model judgement.
 *
 * The judge is part of the version because a deployment that points
 * `FLAGGER_CLASSIFIER` at another model is producing a different measurement:
 * the window estimators treat each version as its own population rather than
 * pooling judgements from two judges. The provider and model are spelled out so
 * the version is readable in the score row; an identity that would overflow the
 * persisted version column collapses to a digest instead, since truncating it
 * would let two judges share a label.
 */
export const buildJudgmentVersion = (
  prefix: string,
  judge: { readonly provider: string; readonly model: string },
): string => {
  const readable = `${prefix}:${judge.provider}/${judge.model}`
  if (readable.length <= FLAGGER_SCORING_ARTIFACT_VERSION_MAX_LENGTH) return readable
  return `${prefix}:h:${fnv1a32(readable)}`
}
