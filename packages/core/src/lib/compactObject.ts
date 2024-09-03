export const compactObject = (obj: Record<string, unknown>) => {
  const newObj: Record<string, unknown> = {}
  Object.keys(obj).forEach((key) => {
    const value = obj[key]
    if (value !== undefined) newObj[key] = value
  })

  return newObj
}
