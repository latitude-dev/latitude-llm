const URL_PATTERNS = [
  /https?:\/\//i,
  /www\./i,
  /[a-z0-9][-a-z0-9]*\.(com|net|org|io|co|me|info|biz|xyz|link|click|top|ru|cn|tk|ml|ga|cf|gq|pw|cc|ws|site|online|store|tech|app|dev|page|blog)\b/i,
]

export function containsUrl(text: string): boolean {
  return URL_PATTERNS.some((pattern) => pattern.test(text))
}
