// JS strings are UTF-16 and can carry an unpaired surrogate — from malformed
// input, or from a naive code-unit slice that split a surrogate pair. Several
// strict downstream parsers (ClickHouse's JSON insert, LLM provider APIs)
// reject those outright, so callers sanitize with this before handing text off.
export function stripLoneSurrogates(text: string): string {
  return text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "�")
}
