const EMOJI_REGEX =
  /^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F|\p{Emoji_Modifier_Base}\p{Emoji_Modifier}?|\p{Emoji_Component}(?:\u200D\p{Emoji_Presentation})*)\s*/u

export function extractLeadingEmoji(text: string): [string | null, string] {
  const match = text.match(EMOJI_REGEX)
  if (!match) return [null, text]
  return [match[1] ?? null, text.slice(match[0].length)]
}
