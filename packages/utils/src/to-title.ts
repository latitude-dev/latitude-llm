/**
 * Uppercases the first letter of every word, preserving the casing of the
 * remaining letters. Useful for short labels where the source string may
 * already carry mixed casing we don't want to flatten ("MacOS", "iPhone",
 * "GitHub" all survive intact; "chrome" / "ios" get their first letter
 * promoted).
 *
 * Word boundaries are runs of ASCII letters, optionally suffixed with a
 * straight apostrophe + more letters (so "don't" → "Don't"). Anything
 * non-letter (numbers, punctuation, whitespace) is left untouched.
 */
export function toTitle(str: string): string {
  return str.replace(/[A-Za-z]+('[A-Za-z]+)?/g, (word) => word.charAt(0).toUpperCase() + word.slice(1))
}
