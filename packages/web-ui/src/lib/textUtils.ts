const LEADING_EMOJI_REGEX =
  /^((?:\p{Regional_Indicator}{2})|(?:[0-9#*]\uFE0F?\u20E3)|(?:\p{Emoji}(?:\uFE0F|\p{Emoji_Modifier})?(?:\u200D\p{Emoji}(?:\uFE0F|\p{Emoji_Modifier})?)*))/u

export function extractLeadingEmoji(
  text: string,
): [string | undefined, string] {
  const match = text.match(LEADING_EMOJI_REGEX)
  if (!match) return [undefined, text]

  const leadingEmoji = match[1]
  const rest = text.slice(leadingEmoji.length).trimStart()

  return [leadingEmoji, rest]
}

export function stringifyUnknown(value: unknown): string {
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}
