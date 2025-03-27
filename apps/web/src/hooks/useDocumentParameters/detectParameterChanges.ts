export function detectParamChanges(
  prev: Set<string>,
  next: Set<string>,
): {
  added: string[]
  removed: string[]
  changed: boolean
} {
  const removed = Array.from(prev).filter((p) => !next.has(p))
  const added = Array.from(next).filter((p) => !prev.has(p))
  return {
    added,
    removed,
    changed: added.length > 0 || removed.length > 0,
  }
}
