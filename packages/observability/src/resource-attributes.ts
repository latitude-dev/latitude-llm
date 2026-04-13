export const appendResourceAttribute = (key: string, value: string) => {
  const current = process.env.OTEL_RESOURCE_ATTRIBUTES
  const pairs = (current ? current.split(",") : []).filter(Boolean)
  const filteredPairs = pairs.filter((pair) => !pair.startsWith(`${key}=`))
  filteredPairs.push(`${key}=${value}`)
  process.env.OTEL_RESOURCE_ATTRIBUTES = filteredPairs.join(",")
}
