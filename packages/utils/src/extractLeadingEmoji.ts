// `\p{Emoji_Component}` also covers the keycap bases (`0`-`9`, `#`, `*`), which
// only render as emoji when followed by U+20E3 (e.g. `1\uFE0F\u20E3`). Without the
// lookahead a title such as "2024 roadmap" has its leading digit peeled off as
// an emoji, leaving "024 roadmap" as the name.
const EMOJI_REGEX =
  /^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F|\p{Emoji_Modifier_Base}\p{Emoji_Modifier}?|(?![0-9#*])\p{Emoji_Component}(?:\u200D\p{Emoji_Presentation})*)\s*/u

export function extractLeadingEmoji(text: string): [string | null, string] {
  const match = text.match(EMOJI_REGEX)
  if (!match) return [null, text]
  return [match[1] ?? null, text.slice(match[0].length)]
}
