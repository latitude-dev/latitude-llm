const LETTER_HUES: Record<string, number> = {
  A: 0,
  B: 25,
  C: 50,
  D: 75,
  E: 100,
  F: 125,
  G: 150,
  H: 175,
  I: 200,
  J: 215,
  K: 230,
  L: 245,
  M: 260,
  N: 275,
  O: 290,
  P: 305,
  Q: 320,
  R: 335,
  S: 350,
  T: 15,
  U: 40,
  V: 65,
  W: 90,
  X: 115,
  Y: 140,
  Z: 165,
}

/**
 * Get the hue value for a given letter.
 * @param letter - The letter to get the hue for.
 * @returns The hue value (0-360), defaulting to 180 if not found.
 */
function getLetterHue(letter: string): number {
  const upperLetter = letter.toUpperCase()
  return LETTER_HUES[upperLetter] ?? 180
}

/**
 * Get the HSL background color for a given letter.
 * @param letter - The letter to get the color for.
 * @returns HSL string for the background color.
 */
export function getAvatarBackgroundColor(letter: string): string {
  const hue = getLetterHue(letter)
  return `hsl(${hue}, 70%, 85%)`
}

/**
 * Get the HSL text color for a given letter.
 * @param letter - The letter to get the color for.
 * @returns HSL string for the text color.
 */
export function getAvatarTextColor(letter: string): string {
  const hue = getLetterHue(letter)
  return `hsl(${hue}, 50%, 30%)`
}
