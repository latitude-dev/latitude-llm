export function parseSSEvent(data?: string) {
  if (!data) return

  const event = data
    .trim()
    .split('\n')
    .reduce(
      (acc, line) => {
        const [key, value] = line.split(': ')

        try {
          acc[key!] = JSON.parse(value!)
        } catch (_e) {
          acc[key!] = value || ''
        }

        return acc
      },
      {} as Record<string, string>,
    )

  return event
}
