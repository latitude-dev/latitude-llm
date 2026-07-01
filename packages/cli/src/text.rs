// SPDX-License-Identifier: Apache-2.0

use unicode_normalization::UnicodeNormalization;

/// Max chars for CLI `--help` method descriptions (terminal-width friendly).
pub const CLI_DESCRIPTION_LIMIT: usize = 200;

/// Convert a parameter name to an idiomatic kebab-case CLI flag.
///
/// Handles snake_case (`min_start_time` → `min-start-time`), camelCase
/// (`pageToken` → `page-token`), and Header-Case names that already
/// contain dashes (`Idempotency-Key` → `idempotency-key`). Adjacent
/// separator characters never produce double dashes — both `_` and `-`
/// collapse to a single `-`, and an uppercase letter that immediately
/// follows a separator is *not* preceded by an additional dash.
pub fn to_kebab_flag(s: &str) -> String {
    let mut result = String::with_capacity(s.len() + 4);
    for (i, ch) in s.chars().enumerate() {
        if ch == '_' || ch == '-' {
            if !result.is_empty() && !result.ends_with('-') {
                result.push('-');
            }
        } else if ch.is_uppercase() {
            if i > 0 && !result.is_empty() && !result.ends_with('-') {
                result.push('-');
            }
            result.push(ch.to_lowercase().next().unwrap());
        } else {
            result.push(ch);
        }
    }
    result
}

/// Convert an identifier to SCREAMING_SNAKE_CASE, the canonical env-var
/// spelling for `--<kebab>` flags.
///
/// Mirrors [`to_kebab_flag`] then uppercases and swaps hyphens for
/// underscores: `pageToken` → `PAGE_TOKEN`, `min_start_time` →
/// `MIN_START_TIME`, `garden-id` → `GARDEN_ID`. Used by
/// `x-fern-sdk-variables` to derive the env-var fallback for each global.
pub fn to_screaming_snake(s: &str) -> String {
    to_kebab_flag(s).to_ascii_uppercase().replace('-', "_")
}

/// Sanitize an OpenAPI parameter wire name into a valid CLI flag name.
///
/// Pipeline (applied in order):
///
/// 1. **Reject** names containing ASCII control characters (`\x00`–`\x1f`,
///    `\x7f`) or whitespace (space, tab, newline, carriage return).
/// 2. **NFKD transliterate**: decompose Unicode, strip combining marks, and
///    drop zero-width / bidi-control codepoints. Reject names that still
///    contain non-ASCII characters after decomposition (CJK, RTL, etc.).
/// 3. **Kebab-case normalize**: apply camelCase / snake_case / PascalCase →
///    kebab-case conversion, and replace any remaining character outside
///    `[A-Za-z0-9]` with `-`.
/// 4. **Tidy**: collapse repeated `-` to one, trim leading/trailing `-`.
///
/// Returns `Ok(flag_name)` or `Err(message)` describing why the name is
/// invalid. The caller is responsible for reserved-name and collision
/// checks (those require cross-parameter context).
pub fn sanitize_flag_name(wire_name: &str) -> Result<String, String> {
    if wire_name.is_empty() {
        return Err("Parameter name is empty".to_string());
    }

    // Step 1: reject control characters and whitespace.
    for ch in wire_name.chars() {
        if ch.is_ascii_control() {
            return Err(format!(
                "Parameter '{wire_name}' contains control character U+{:04X}",
                ch as u32,
            ));
        }
        if ch.is_whitespace() {
            return Err(format!(
                "Parameter '{wire_name}' contains whitespace character U+{:04X}",
                ch as u32,
            ));
        }
    }

    // Step 2: NFKD decompose → strip combining marks and zero-width/bidi
    // codepoints → reject remaining non-ASCII.
    let decomposed: String = wire_name
        .nfkd()
        .filter(|ch| {
            // Drop combining marks (Unicode category M).
            if is_combining_mark(*ch) {
                return false;
            }
            // Drop zero-width and bidi-control codepoints.
            if is_zero_width_or_bidi(*ch) {
                return false;
            }
            true
        })
        .collect();

    for ch in decomposed.chars() {
        if !ch.is_ascii() {
            return Err(format!(
                "Parameter '{wire_name}' contains non-transliterable character '{ch}' (U+{:04X})",
                ch as u32,
            ));
        }
    }

    // Steps 3 + 4: kebab-case normalize with extended sanitization, then tidy.
    let sanitized = to_kebab_flag_sanitized(&decomposed);

    if sanitized.is_empty() {
        return Err(format!(
            "Parameter '{wire_name}' sanitizes to an empty string",
        ));
    }

    Ok(sanitized)
}

/// Like [`to_kebab_flag`] but treats *any* non-alphanumeric character as a
/// word separator (not just `_` and `-`). This catches `:`, `.`, `[`, `]`,
/// `{`, `}`, `+`, `,`, `=`, etc. — all the shell-special and
/// POSIX-flag-name-violating characters listed in the sanitization spec.
fn to_kebab_flag_sanitized(s: &str) -> String {
    let mut result = String::with_capacity(s.len() + 4);
    for (i, ch) in s.chars().enumerate() {
        if ch.is_ascii_alphanumeric() {
            if ch.is_ascii_uppercase() {
                // camelCase word boundary: insert dash before uppercase
                // unless we're at the start or already have a dash.
                if i > 0 && !result.is_empty() && !result.ends_with('-') {
                    result.push('-');
                }
                result.push(ch.to_ascii_lowercase());
            } else {
                result.push(ch);
            }
        } else {
            // Any non-alphanumeric → separator dash (collapsed later).
            if !result.is_empty() && !result.ends_with('-') {
                result.push('-');
            }
        }
    }
    // Trim trailing dashes.
    while result.ends_with('-') {
        result.pop();
    }
    result
}

/// Returns `true` for Unicode combining marks (category M: Mn, Mc, Me).
fn is_combining_mark(ch: char) -> bool {
    // Combining Diacritical Marks: U+0300–U+036F
    // Combining Diacritical Marks Extended: U+1AB0–U+1AFF
    // Combining Diacritical Marks Supplement: U+1DC0–U+1DFF
    // Combining Diacritical Marks for Symbols: U+20D0–U+20FF
    // Combining Half Marks: U+FE20–U+FE2F
    matches!(ch,
        '\u{0300}'..='\u{036F}'
        | '\u{1AB0}'..='\u{1AFF}'
        | '\u{1DC0}'..='\u{1DFF}'
        | '\u{20D0}'..='\u{20FF}'
        | '\u{FE20}'..='\u{FE2F}'
    )
}

/// Returns `true` for zero-width and bidi-control codepoints that should
/// be silently stripped from parameter names.
fn is_zero_width_or_bidi(ch: char) -> bool {
    matches!(ch,
        '\u{200B}' // ZERO WIDTH SPACE
        | '\u{200C}' // ZERO WIDTH NON-JOINER
        | '\u{200D}' // ZERO WIDTH JOINER
        | '\u{FEFF}' // ZERO WIDTH NO-BREAK SPACE (BOM)
        | '\u{200E}' // LEFT-TO-RIGHT MARK
        | '\u{200F}' // RIGHT-TO-LEFT MARK
        | '\u{202A}'..='\u{202E}' // LRE, RLE, PDF, LRO, RLO
        | '\u{2066}'..='\u{2069}' // LRI, RLI, FSI, PDI
    )
}

/// Truncates a description string to `max_chars` using smart boundaries.
///
/// When `strip_links` is true, markdown links `[text](url)` are replaced with
/// just `text` to reclaim character budget (useful for CLI help / frontmatter).
/// When false, links are preserved (useful for skill body text where agents can
/// follow URLs).
///
/// Truncation strategy:
/// 1. If a complete sentence (ending in `. `) fits within the limit, truncate there.
/// 2. Otherwise, break at the last word boundary (space) and append `…`.
/// 3. If no space exists, hard-cut at `max_chars - 1` and append `…`.
pub fn truncate_description(desc: &str, max_chars: usize, strip_links: bool) -> String {
    if max_chars == 0 {
        return String::new();
    }

    let cleaned = if strip_links {
        strip_markdown_links(desc)
    } else {
        desc.to_string()
    };
    let trimmed = cleaned.trim();

    // Count chars (UTF-8 safe)
    let char_count = trimmed.chars().count();
    if char_count <= max_chars {
        return trimmed.to_string();
    }

    // Collect the first `max_chars` characters as a string to search within.
    let prefix: String = trimmed.chars().take(max_chars).collect();

    // Try to find the last complete sentence within the limit.
    // A sentence ends with ". " followed by more text, or "." at the end of
    // the prefix. We look for the last ". " to find a sentence boundary.
    if let Some(sentence_end) = find_last_sentence_boundary(&prefix) {
        let truncated: String = trimmed.chars().take(sentence_end).collect();
        return truncated;
    }

    // Fall back to last word boundary (space) within the limit.
    if let Some(last_space) = rfind_char_boundary(&prefix, ' ') {
        let truncated: String = trimmed.chars().take(last_space).collect();
        return format!("{truncated}…");
    }

    // Hard cut — no spaces at all
    let truncated: String = trimmed.chars().take(max_chars - 1).collect();
    format!("{truncated}…")
}

/// Strips markdown-style links `[text](url)` and replaces them with just `text`.
fn strip_markdown_links(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let chars: Vec<char> = s.chars().collect();
    let len = chars.len();
    let mut i = 0;

    while i < len {
        if chars[i] == '[' {
            // Look for the closing ] followed by (
            if let Some(close_bracket) = find_char_from(&chars, ']', i + 1) {
                if close_bracket + 1 < len && chars[close_bracket + 1] == '(' {
                    if let Some(close_paren) = find_char_from(&chars, ')', close_bracket + 2) {
                        // Found a complete [text](url) — emit just the text
                        result.extend(&chars[i + 1..close_bracket]);
                        i = close_paren + 1;
                        continue;
                    }
                }
            }
        }
        result.push(chars[i]);
        i += 1;
    }

    result
}

/// Finds the character-index of `target` starting from position `from`.
fn find_char_from(chars: &[char], target: char, from: usize) -> Option<usize> {
    chars[from..]
        .iter()
        .position(|&c| c == target)
        .map(|p| from + p)
}

/// Finds the last sentence boundary within a char-indexed string.
/// A sentence boundary is a position right after ". " where we can cleanly cut.
/// Returns the char-count to include (up to and including the period).
fn find_last_sentence_boundary(prefix: &str) -> Option<usize> {
    let chars: Vec<char> = prefix.chars().collect();
    let mut last_boundary = None;

    for (i, _) in chars.iter().enumerate() {
        if chars[i] == '.' {
            let after_period = i + 1;
            // Sentence boundary: period followed by a space, or period at end of prefix
            if after_period == chars.len()
                || (after_period < chars.len() && chars[after_period] == ' ')
            {
                last_boundary = Some(after_period);
            }
        }
    }

    last_boundary
}

/// Finds the last occurrence of `target` in a string, returning its char-index.
fn rfind_char_boundary(s: &str, target: char) -> Option<usize> {
    let chars: Vec<char> = s.chars().collect();
    chars.iter().rposition(|&c| c == target)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn short_desc_unchanged() {
        let desc = "Lists all files.";
        assert_eq!(truncate_description(desc, 200, true), "Lists all files.");
    }

    #[test]
    fn truncate_at_sentence_boundary() {
        let desc = "Creates a file in Drive. This method supports multipart upload. See the guide for details on how to use it.";
        // At limit 30, only the first sentence fits before the sentence boundary.
        let result = truncate_description(desc, 30, true);
        assert_eq!(result, "Creates a file in Drive.");

        // At limit 70, both first and second sentences fit.
        let result = truncate_description(desc, 70, true);
        assert_eq!(
            result,
            "Creates a file in Drive. This method supports multipart upload."
        );
    }

    #[test]
    fn truncate_at_word_boundary() {
        let desc = "Create a guest user with access to a subset of Workspace capabilities";
        let result = truncate_description(desc, 50, true);
        // Should cut at the last space before char 50
        assert!(result.ends_with('…'));
        assert!(result.len() <= 55); // 50 chars + ellipsis
        assert!(!result.contains("capabil")); // Should not cut mid-word
    }

    #[test]
    fn hard_cut_no_spaces() {
        let desc = "abcdefghijklmnopqrstuvwxyz";
        let result = truncate_description(desc, 10, true);
        assert_eq!(result, "abcdefghi…");
    }

    #[test]
    fn strips_markdown_links() {
        let desc = "Create a guest user with access to a [subset of Workspace capabilities](https://support.google.com/a/answer/16558545). This feature is in Alpha.";
        let result = truncate_description(desc, 200, true);
        assert_eq!(
            result,
            "Create a guest user with access to a subset of Workspace capabilities. This feature is in Alpha."
        );
        assert!(!result.contains("https://"));
        assert!(!result.contains('['));
    }

    #[test]
    fn preserves_links_when_strip_links_false() {
        let desc = "Create a guest user with access to a [subset of Workspace capabilities](https://support.google.com/a/answer/16558545). This feature is in Alpha.";
        let result = truncate_description(desc, 500, false);
        assert!(result.contains("https://support.google.com"));
        assert!(result.contains("[subset of Workspace capabilities]"));
    }

    #[test]
    fn strips_markdown_links_and_truncates() {
        let desc = "Create a guest user with access to a [subset of Workspace capabilities](https://support.google.com/a/answer/16558545). This feature is currently in Alpha. Please reach out to support if you are interested in enabling this feature.";
        let result = truncate_description(desc, 120, true);
        // After stripping the link, the sentence boundary should work.
        assert!(result.contains("subset of Workspace capabilities."));
        assert!(!result.contains("https://"));
    }

    #[test]
    fn multibyte_safe() {
        let desc = "Résumé création für Ñoño — a long description that should be safely truncated at word boundaries without panicking on multi-byte chars";
        let result = truncate_description(desc, 30, true);
        assert!(result.ends_with('…') || result.chars().count() <= 30);
    }

    #[test]
    fn empty_and_whitespace() {
        assert_eq!(truncate_description("", 100, true), "");
        assert_eq!(truncate_description("   ", 100, true), "");
        assert_eq!(truncate_description("", 0, true), "");
    }

    #[test]
    fn test_strip_markdown_links() {
        assert_eq!(strip_markdown_links("[text](http://example.com)"), "text");
        assert_eq!(
            strip_markdown_links("Use [this link](http://a.com) and [that](http://b.com) too"),
            "Use this link and that too"
        );
        assert_eq!(strip_markdown_links("no links here"), "no links here");
        // Incomplete link syntax should be left alone
        assert_eq!(strip_markdown_links("[broken"), "[broken");
        assert_eq!(strip_markdown_links("[text]no-parens"), "[text]no-parens");
    }

    #[test]
    fn preserves_sentence_ending_at_limit() {
        let desc = "Deletes a user.";
        assert_eq!(truncate_description(desc, 15, true), "Deletes a user.");
    }

    #[test]
    fn does_not_cut_url_looking_periods() {
        // Periods in URLs or abbreviations like "v1." shouldn't be treated as sentence ends
        // unless followed by a space
        let desc = "See the docs at developers.google.com for more details on this API endpoint";
        let result = truncate_description(desc, 50, true);
        // Should truncate at word boundary, not at "developers."
        assert!(result.ends_with('…'));
    }

    #[test]
    fn sentence_boundary_at_exact_limit() {
        // Period falls exactly at the end of the prefix — should still detect it
        let desc = "This is a complete sentence. And more text follows here.";
        let result = truncate_description(desc, 28, true);
        assert_eq!(result, "This is a complete sentence.");
    }

    #[test]
    fn zero_max_chars() {
        assert_eq!(truncate_description("anything", 0, true), "");
    }

    #[test]
    fn test_to_kebab_flag() {
        // snake_case
        assert_eq!(to_kebab_flag("page_token"), "page-token");
        assert_eq!(to_kebab_flag("user_id"), "user-id");
        assert_eq!(to_kebab_flag("min_start_time"), "min-start-time");
        assert_eq!(to_kebab_flag("a_b_c"), "a-b-c");
        // camelCase
        assert_eq!(to_kebab_flag("pageToken"), "page-token");
        assert_eq!(to_kebab_flag("userId"), "user-id");
        assert_eq!(to_kebab_flag("minStartTime"), "min-start-time");
        assert_eq!(to_kebab_flag("eventTypeURI"), "event-type-u-r-i");
        // already kebab or simple
        assert_eq!(to_kebab_flag("simple"), "simple");
        assert_eq!(to_kebab_flag("uuid"), "uuid");
        assert_eq!(to_kebab_flag(""), "");
        // Header-Case (HTTP header names — idempotency headers, custom
        // headers — pass through to the flag builder as-is via the
        // synthetic-parameter path).
        assert_eq!(to_kebab_flag("Idempotency-Key"), "idempotency-key");
        assert_eq!(to_kebab_flag("X-Request-Id"), "x-request-id");
        assert_eq!(to_kebab_flag("Content-Type"), "content-type");
        // Defensive: doubled separators in mixed-case inputs collapse.
        assert_eq!(to_kebab_flag("foo--bar"), "foo-bar");
        assert_eq!(to_kebab_flag("foo__bar"), "foo-bar");
        assert_eq!(to_kebab_flag("-leading-dash"), "leading-dash");
    }

    #[test]
    fn test_to_screaming_snake() {
        // camelCase → SCREAMING_SNAKE
        assert_eq!(to_screaming_snake("gardenId"), "GARDEN_ID");
        assert_eq!(to_screaming_snake("pageToken"), "PAGE_TOKEN");
        // snake_case stays underscore-delimited and uppercases
        assert_eq!(to_screaming_snake("min_start_time"), "MIN_START_TIME");
        // kebab inputs flatten the same way as camel
        assert_eq!(to_screaming_snake("garden-id"), "GARDEN_ID");
        // single token
        assert_eq!(to_screaming_snake("uuid"), "UUID");
        assert_eq!(to_screaming_snake(""), "");
    }

    // ------------------------------------------------------------------
    // sanitize_flag_name — FER-10430 parametrized table
    // ------------------------------------------------------------------

    #[test]
    fn test_sanitize_flag_name_table() {
        let cases: &[(&str, &str)] = &[
            ("id:in",                   "id-in"),
            ("customer_group_id:in",    "customer-group-id-in"),
            ("date_created:min",        "date-created-min"),
            ("email:like",              "email-like"),
            ("customer_id",             "customer-id"),
            ("customerId",              "customer-id"),
            ("address.street",          "address-street"),
            ("tag[0]",                  "tag-0"),
            ("customer{id}",            "customer-id"),
            ("q+filter",               "q-filter"),
            ("category,subcategory",    "category-subcategory"),
            ("na\u{00ef}ve",            "naive"),      // naïve → NFKD
            ("from-date",              "from-date"),   // already valid
            ("__proto__",              "proto"),        // leading/trailing trimmed
        ];
        for (wire, expected) in cases {
            let result = sanitize_flag_name(wire).unwrap_or_else(|e| {
                panic!("sanitize_flag_name({wire:?}) returned Err: {e}")
            });
            assert_eq!(
                result, *expected,
                "sanitize_flag_name({wire:?}): got {result:?}, expected {expected:?}",
            );
        }
    }

    #[test]
    fn test_sanitize_flag_name_rejects_control_chars() {
        let result = sanitize_flag_name("id\x00in");
        assert!(result.is_err(), "control char should be rejected");
        assert!(result.unwrap_err().contains("control character"));
    }

    #[test]
    fn test_sanitize_flag_name_rejects_whitespace() {
        let result = sanitize_flag_name("id in");
        assert!(result.is_err(), "whitespace should be rejected");
        assert!(result.unwrap_err().contains("whitespace"));
    }

    #[test]
    fn test_sanitize_flag_name_rejects_cjk() {
        let result = sanitize_flag_name("\u{5DF2}\u{8BFB}");
        assert!(result.is_err(), "CJK should be rejected");
        assert!(result.unwrap_err().contains("non-transliterable"));
    }

    #[test]
    fn test_sanitize_flag_name_idempotence() {
        let cases = &["id:in", "customer_group_id:in", "address.street", "na\u{00ef}ve"];
        for wire in cases {
            let first = sanitize_flag_name(wire).unwrap();
            let second = sanitize_flag_name(&first).unwrap();
            assert_eq!(
                first, second,
                "sanitize_flag_name should be idempotent for {wire:?}: first={first:?}, second={second:?}",
            );
        }
    }

    #[test]
    fn test_sanitize_flag_name_empty_rejected() {
        assert!(sanitize_flag_name("").is_err());
    }

    #[test]
    fn test_sanitize_flag_name_strips_zero_width() {
        // Zero-width space inside a name is silently stripped (invisible,
        // so the adjacent letters merge).
        let result = sanitize_flag_name("foo\u{200B}bar").unwrap();
        assert_eq!(result, "foobar");
    }
}
