type SimpleParam = string | number | boolean
type UriParam = SimpleParam | SimpleParam[]

function encodeUriParam(value: UriParam) {
  if (Array.isArray(value)) return value.map(encodeURIComponent).join(',')

  return encodeURIComponent(value)
}

export function addParameters(
  route: string,
  parameters: Record<string, UriParam | undefined>,
): string {
  const [path, query] = route.split('?')
  const params = [
    ...(query?.split('&') ?? []),
    ...Object.entries(parameters)
      .filter(([_, v]) => v !== undefined)
      .map(([key, value]) => `${key}=${encodeUriParam(value!)}`),
  ]

  if (!params.length) return path!

  return `${path}?${params.join('&')}`
}

export function decodeParameters(route: string): Record<string, UriParam> {
  const [_, query] = route.split('?')
  if (!query) return {}

  const params = query.split('&')
  return params.reduce((acc: Record<string, UriParam>, param: string) => {
    const [key, value] = param.split('=')
    if (!key || !value) return acc
    if (value.includes(',')) {
      return {
        ...acc,
        [key]: value.split(',').map(decodeURIComponent),
      }
    }
    return { ...acc, [key]: decodeURIComponent(value) }
  }, {})
}
