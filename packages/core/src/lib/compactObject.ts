export const compactObject = (
  obj: Record<string, unknown | undefined>,
): Record<string, unknown> => {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, value]) => value !== undefined),
  )
}
