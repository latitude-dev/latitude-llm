// SPDX-License-Identifier: Apache-2.0

//! Shared input validation helpers.
//!
//! These functions harden CLI inputs against adversarial or accidentally
//! malformed values — especially important when the CLI is invoked by an
//! LLM agent rather than a human operator.

use crate::error::CliError;
use std::path::{Path, PathBuf};

use crate::output::reject_dangerous_chars as reject_control_chars;

/// Validates that `dir` is a safe output directory.
///
/// The path is resolved relative to CWD. The function rejects paths that
/// would escape above CWD (e.g. `../../.ssh`) or contain null bytes /
/// control characters.
///
/// Returns the canonicalized path on success.
pub fn validate_safe_output_dir(dir: &str) -> Result<PathBuf, CliError> {
    reject_control_chars(dir, "--output-dir")?;

    let path = Path::new(dir);

    // Reject absolute paths — force everything relative to CWD
    if path.is_absolute() {
        return Err(CliError::Validation(format!(
            "--output-dir must be a relative path, got absolute path '{dir}'"
        )));
    }

    // Canonicalize CWD and resolve the target under it
    let cwd = std::env::current_dir()
        .map_err(|e| CliError::Validation(format!("Failed to determine current directory: {e}")))?;
    let resolved = cwd.join(path);

    // If the directory already exists, canonicalize. Otherwise, canonicalize
    // the longest existing prefix and append the remaining segments.
    let canonical = if resolved.exists() {
        resolved.canonicalize().map_err(|e| {
            CliError::Validation(format!("Failed to resolve --output-dir '{dir}': {e}"))
        })?
    } else {
        normalize_non_existing(&resolved)?
    };

    let canonical_cwd = cwd.canonicalize().map_err(|e| {
        CliError::Validation(format!("Failed to canonicalize current directory: {e}"))
    })?;

    if !canonical.starts_with(&canonical_cwd) {
        return Err(CliError::Validation(format!(
            "--output-dir '{dir}' resolves to '{}' which is outside the current directory",
            canonical.display()
        )));
    }

    Ok(canonical)
}

/// Validates that `dir` is a safe directory for reading files (e.g. `--dir`
/// in `script +push`).
///
/// Similar to [`validate_safe_output_dir`] but also follows symlinks
/// safely and ensures the resolved path stays under CWD.
pub fn validate_safe_dir_path(dir: &str) -> Result<PathBuf, CliError> {
    reject_control_chars(dir, "--dir")?;

    let path = Path::new(dir);

    // "." is always safe (CWD itself)
    if dir == "." {
        return std::env::current_dir().map_err(|e| {
            CliError::Validation(format!("Failed to determine current directory: {e}"))
        });
    }

    if path.is_absolute() {
        return Err(CliError::Validation(format!(
            "--dir must be a relative path, got absolute path '{dir}'"
        )));
    }

    let cwd = std::env::current_dir()
        .map_err(|e| CliError::Validation(format!("Failed to determine current directory: {e}")))?;
    let resolved = cwd.join(path);

    let canonical = resolved
        .canonicalize()
        .map_err(|e| CliError::Validation(format!("Failed to resolve --dir '{dir}': {e}")))?;

    let canonical_cwd = cwd.canonicalize().map_err(|e| {
        CliError::Validation(format!("Failed to canonicalize current directory: {e}"))
    })?;

    if !canonical.starts_with(&canonical_cwd) {
        return Err(CliError::Validation(format!(
            "--dir '{dir}' resolves to '{}' which is outside the current directory",
            canonical.display()
        )));
    }

    Ok(canonical)
}

/// Validates a `--output` (or otherwise write-side) file path.
///
/// Rejects paths that escape above CWD via `..` traversal, contain
/// control characters, name a parent directory that doesn't exist, or
/// follow intermediate symlinks to locations outside CWD. Absolute
/// paths are allowed, but the resolved target must still live under CWD.
///
/// # Returns a path with an *un-canonicalized basename*
///
/// The returned [`PathBuf`] is `canonical_parent.join(basename)`. The
/// basename is preserved verbatim so that callers can open it with
/// `O_NOFOLLOW` and have the kernel refuse a final-component symlink
/// atomically. A full `canonicalize()` of the whole path would silently
/// resolve a basename symlink, opening a writeback primitive against the
/// symlink target.
///
/// This means **callers MUST open the returned path with `O_NOFOLLOW`**
/// (or equivalent — see [`crate::openapi::executor`] `create_file_no_follow`).
/// A plain [`tokio::fs::File::open`] / [`std::fs::read`] on the returned
/// path will silently follow a basename symlink — re-introducing the
/// vulnerability this function was designed to prevent.
///
/// # TOCTOU caveat
///
/// Best-effort defence-in-depth. A local attacker with write access to a
/// parent directory could replace a path component between validation
/// and the subsequent I/O. Race-free protection requires
/// `openat2(RESOLVE_NO_SYMLINKS|RESOLVE_BENEATH)` on Linux or a
/// per-component `openat(O_NOFOLLOW|O_DIRECTORY)` chain from a CWD
/// dir-fd elsewhere — tracked as a follow-up.
pub fn validate_safe_file_path(path_str: &str, flag_name: &str) -> Result<PathBuf, CliError> {
    reject_control_chars(path_str, flag_name)?;

    let path = Path::new(path_str);
    let cwd = std::env::current_dir()
        .map_err(|e| CliError::Validation(format!("Failed to determine current directory: {e}")))?;

    let resolved = if path.is_absolute() {
        path.to_path_buf()
    } else {
        cwd.join(path)
    };

    // Reject empty / dot-only inputs explicitly so the user sees a clear
    // diagnostic instead of the misleading "resolves to <cwd> which is
    // outside the current directory" message that would otherwise fire
    // (because `cwd.join("")` and `cwd.join(".")` both have file_name() ==
    // `<cwd_basename>` and parent() == `<parent-of-cwd>`).
    let trimmed = path_str.trim();
    if trimmed.is_empty() || trimmed == "." || trimmed == ".." {
        return Err(CliError::Validation(format!(
            "{flag_name} requires a filename, got '{path_str}'"
        )));
    }

    // Separate the basename from the parent directory: we canonicalize the
    // *parent* (resolves intermediate symlinks for traversal detection) but
    // leave the basename un-resolved. Callers that open the returned path
    // with `O_NOFOLLOW` (see openapi::executor::create_file_no_follow) then
    // rely on the kernel to refuse a final-component symlink atomically.
    // A full `canonicalize()` of the whole path would silently resolve the
    // basename symlink, opening a writeback primitive against its target.
    //
    // We REQUIRE the parent to already exist. Lexically projecting a path
    // whose parent doesn't exist (the old `normalize_non_existing` branch)
    // was a vector for the intermediate-symlink bypass: an attacker could
    // plant the missing parent as a symlink to outside CWD between validate
    // and open, and `O_NOFOLLOW` only catches the FINAL component. Users
    // must `mkdir -p <parent>` first.
    let basename = resolved.file_name().ok_or_else(|| {
        CliError::Validation(format!(
            "{flag_name} '{path_str}' has no filename component"
        ))
    })?;
    let parent = resolved.parent().ok_or_else(|| {
        CliError::Validation(format!(
            "{flag_name} '{path_str}' has no parent directory"
        ))
    })?;
    if !parent.exists() {
        return Err(CliError::Validation(format!(
            "{flag_name} '{}' parent directory '{}' does not exist; create it first (e.g. `mkdir -p {}`)",
            path_str,
            parent.display(),
            parent.display(),
        )));
    }
    let canonical_parent = parent.canonicalize().map_err(|e| {
        CliError::Validation(format!("Failed to resolve {flag_name} '{path_str}': {e}"))
    })?;

    let canonical_cwd = cwd.canonicalize().map_err(|e| {
        CliError::Validation(format!("Failed to canonicalize current directory: {e}"))
    })?;

    if !canonical_parent.starts_with(&canonical_cwd) {
        return Err(CliError::Validation(format!(
            "{flag_name} '{}' resolves to '{}' which is outside the current directory",
            path_str,
            canonical_parent.join(basename).display()
        )));
    }

    Ok(canonical_parent.join(basename))
}


// reject_control_chars is now a re-export from crate::output (see top of file)

/// Resolves a path that may not exist yet by canonicalizing the existing
/// prefix and appending remaining components.
fn normalize_non_existing(path: &Path) -> Result<PathBuf, CliError> {
    let mut resolved = PathBuf::new();
    let mut remaining = Vec::new();

    // Walk backwards until we find a component that exists
    let mut current = path.to_path_buf();
    loop {
        if current.exists() {
            resolved = current
                .canonicalize()
                .map_err(|e| CliError::Validation(format!("Failed to canonicalize path: {e}")))?;
            break;
        }
        if let Some(name) = current.file_name() {
            remaining.push(name.to_os_string());
        } else {
            // We've exhausted the path without finding an existing prefix
            return Err(CliError::Validation(format!(
                "Cannot resolve path '{}'",
                path.display()
            )));
        }
        current = match current.parent() {
            Some(p) => p.to_path_buf(),
            None => break,
        };
    }

    // Append remaining segments (in reverse since we collected them backwards)
    for seg in remaining.into_iter().rev() {
        resolved.push(seg);
    }

    Ok(resolved)
}

/// Characters to encode in a single URL path segment. All RFC 3986 §2.3
/// unreserved characters (`A-Z a-z 0-9 - . _ ~`) are left unencoded;
/// everything else is percent-encoded.
use percent_encoding::{AsciiSet, CONTROLS};
const PATH_SEGMENT: &AsciiSet = &CONTROLS
    .add(b' ').add(b'!').add(b'"').add(b'#').add(b'$').add(b'%')
    .add(b'&').add(b'\'').add(b'(').add(b')').add(b'*').add(b'+')
    .add(b',').add(b'/').add(b':').add(b';').add(b'<')
    .add(b'=').add(b'>').add(b'?').add(b'@').add(b'[').add(b'\\')
    .add(b']').add(b'^').add(b'`').add(b'{').add(b'|').add(b'}');

/// Percent-encode a value for use as a single URL path segment (e.g., file ID,
/// calendar ID, message ID). All RFC 3986 §2.3 unreserved characters
/// (`A-Z a-z 0-9 - . _ ~`) are left unencoded.
pub fn encode_path_segment(s: &str) -> String {
    use percent_encoding::utf8_percent_encode;
    utf8_percent_encode(s, PATH_SEGMENT).to_string()
}

/// Returns `true` when `segment` is a WHATWG dot-segment that would be
/// collapsed by `url::Url::parse()`. Encoding cannot prevent this —
/// `%2E` and `%2e` are also collapsed — so the caller must reject
/// rather than encode.
pub fn is_dot_segment(segment: &str) -> bool {
    matches!(segment, "." | "..")
}

// -- Query-component encoding ------------------------------------------------
//
// The set below mirrors `QUERY_COMPONENT` in `src/openapi/executor.rs`. Per
// the architecture rule (`AGENTS.md` "Code Generation Model") asyncapi may
// not import from openapi, so the asyncapi executor calls this shared
// helper instead. The set is duplicated by design; if the openapi set
// changes, audit this one for parity.

/// Percent-encode set for a query-string component (key or value).
///
/// RFC 3986 unreserved characters (`A-Za-z0-9-_.~`) are left intact; the comma
/// is also kept literal so a form/no-explode array reads `ids=1,2` rather than
/// `ids=1%2C2`. Everything else — including space (`%20`, *not* the form
/// `+`), `|` (`%7C`), `&`, `=`, `#`, and `[` `]` — is percent-encoded.
const QUERY_COMPONENT: &AsciiSet = &percent_encoding::NON_ALPHANUMERIC
    .remove(b'-')
    .remove(b'_')
    .remove(b'.')
    .remove(b'~')
    .remove(b',');

/// Percent-encode `s` for use as a URL query-string component (key or value).
///
/// Encodes space as `%20` (not `+`), and all reserved characters that would
/// otherwise terminate or split the component (`&`, `=`, `#`, `+`, `/`, `?`,
/// control chars). RFC 3986 unreserved (`A-Za-z0-9-_.~`) and `,` pass through
/// unchanged.
pub fn encode_query_component(s: &str) -> String {
    percent_encoding::utf8_percent_encode(s, QUERY_COMPONENT).to_string()
}

/// Percent-encode a value for use in URI path templates where `/` should stay
/// as a path separator (e.g., RFC 6570 `{+name}` expansions).
///
/// Each path segment is encoded independently, then joined with `/`, so
/// dangerous characters like `#`/`?` are still escaped while hierarchical
/// resource names such as `projects/p/locations/l` remain readable.
pub fn encode_path_preserving_slashes(s: &str) -> String {
    s.split('/')
        .map(encode_path_segment)
        .collect::<Vec<_>>()
        .join("/")
}

/// Validate a multi-segment resource name (e.g., `spaces/ABC`, `subscriptions/123`).
/// Rejects path traversal, control characters, and URL-special characters including `%`
/// to prevent URL-encoded bypasses. Returns the validated name or an error.
pub fn validate_resource_name(s: &str) -> Result<&str, CliError> {
    if s.is_empty() {
        return Err(CliError::Validation(
            "Resource name must not be empty".to_string(),
        ));
    }
    if s.split('/').any(|seg| seg == ".." || seg == ".") {
        return Err(CliError::Validation(format!(
            "Resource name must not contain dot-segments ('.' or '..') : {s}"
        )));
    }
    if s.chars()
        .any(|c| c == '\0' || c.is_control() || crate::output::is_dangerous_unicode(c))
    {
        return Err(CliError::Validation(format!(
            "Resource name contains invalid characters: {s}"
        )));
    }
    // Reject URL-special characters that could inject query params or fragments
    if s.contains('?') || s.contains('#') {
        return Err(CliError::Validation(format!(
            "Resource name must not contain '?' or '#': {s}"
        )));
    }
    // Reject '%' to prevent URL-encoded bypasses (e.g. %2e%2e for ..)
    if s.contains('%') {
        return Err(CliError::Validation(format!(
            "Resource name must not contain '%' (URL encoding bypass attempt): {s}"
        )));
    }
    Ok(s)
}

/// Validate an API identifier (service name, version string) for use in
/// cache filenames and discovery URLs. Only alphanumeric characters, hyphens,
/// underscores, and dots are allowed to prevent path traversal and injection.
pub fn validate_api_identifier(s: &str) -> Result<&str, CliError> {
    if s.is_empty() {
        return Err(CliError::Validation(
            "API identifier must not be empty".to_string(),
        ));
    }
    if !s
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
    {
        return Err(CliError::Validation(format!(
            "API identifier contains invalid characters (only alphanumeric, '-', '_', '.' allowed): {s}"
        )));
    }
    Ok(s)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;
    use std::fs;
    use tempfile::tempdir;

    // --- validate_safe_output_dir ---

    #[test]
    #[serial]
    fn test_output_dir_relative_subdir() {
        // Create a real temp dir and change into it for the test
        let dir = tempdir().unwrap();
        // Canonicalize to handle macOS /var -> /private/var symlink
        let canonical_dir = dir.path().canonicalize().unwrap();
        let sub = canonical_dir.join("output");
        fs::create_dir_all(&sub).unwrap();

        let saved_cwd = std::env::current_dir().unwrap();
        std::env::set_current_dir(&canonical_dir).unwrap();

        let result = validate_safe_output_dir("output");
        std::env::set_current_dir(&saved_cwd).unwrap();

        assert!(result.is_ok(), "expected Ok, got: {result:?}");
    }

    #[test]
    #[serial]
    fn test_output_dir_rejects_symlink_traversal() {
        let dir = tempdir().unwrap();
        let canonical_dir = dir.path().canonicalize().unwrap();

        // Create a directory inside the tempdir
        let allowed_dir = canonical_dir.join("allowed");
        fs::create_dir(&allowed_dir).unwrap();

        // Create a symlink pointing OUTSIDE the tempdir (e.g. to /tmp)
        let symlink_path = canonical_dir.join("sneaky_link");
        #[cfg(unix)]
        std::os::unix::fs::symlink("/tmp", &symlink_path).unwrap();
        #[cfg(windows)]
        return; // Skip on Windows due to privilege requirements for symlinks

        let saved_cwd = std::env::current_dir().unwrap();
        std::env::set_current_dir(&canonical_dir).unwrap();

        // Try to validate the symlink resolving outside CWD
        let result = validate_safe_output_dir("sneaky_link");
        std::env::set_current_dir(&saved_cwd).unwrap();

        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(msg.contains("outside the current directory"), "got: {msg}");
    }

    #[test]
    #[serial]
    fn test_output_dir_rejects_traversal() {
        let dir = tempdir().unwrap();
        let canonical_dir = dir.path().canonicalize().unwrap();
        let saved_cwd = std::env::current_dir().unwrap();
        std::env::set_current_dir(&canonical_dir).unwrap();

        let result = validate_safe_output_dir("../../.ssh");
        std::env::set_current_dir(&saved_cwd).unwrap();

        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(msg.contains("outside the current directory"), "got: {msg}");
    }

    #[test]
    fn test_output_dir_rejects_absolute() {
        assert!(validate_safe_output_dir("/tmp/evil").is_err());
    }

    #[test]
    fn test_output_dir_rejects_null_bytes() {
        assert!(validate_safe_output_dir("foo\0bar").is_err());
    }

    #[test]
    fn test_output_dir_rejects_control_chars() {
        assert!(validate_safe_output_dir("foo\x01bar").is_err());
    }

    #[test]
    #[serial]
    fn test_output_dir_non_existing_subdir() {
        let dir = tempdir().unwrap();
        let canonical_dir = dir.path().canonicalize().unwrap();
        let saved_cwd = std::env::current_dir().unwrap();
        std::env::set_current_dir(&canonical_dir).unwrap();

        let result = validate_safe_output_dir("new/nested/dir");
        std::env::set_current_dir(&saved_cwd).unwrap();

        assert!(
            result.is_ok(),
            "expected Ok for non-existing subdir, got: {result:?}"
        );
    }

    // --- validate_safe_dir_path ---

    #[test]
    fn test_dir_path_cwd() {
        assert!(validate_safe_dir_path(".").is_ok());
    }

    #[test]
    #[serial]
    fn test_dir_path_rejects_traversal() {
        let dir = tempdir().unwrap();
        let canonical_dir = dir.path().canonicalize().unwrap();
        let saved_cwd = std::env::current_dir().unwrap();
        std::env::set_current_dir(&canonical_dir).unwrap();

        let result = validate_safe_dir_path("../../etc");
        std::env::set_current_dir(&saved_cwd).unwrap();

        assert!(result.is_err());
    }

    #[test]
    fn test_dir_path_rejects_absolute() {
        assert!(validate_safe_dir_path("/usr/local").is_err());
    }

    // --- reject_control_chars ---

    #[test]
    fn test_reject_control_chars_clean() {
        assert!(reject_control_chars("hello/world", "test").is_ok());
    }

    #[test]
    fn test_reject_control_chars_tab() {
        assert!(reject_control_chars("hello\tworld", "test").is_err());
    }

    #[test]
    fn test_reject_control_chars_newline() {
        assert!(reject_control_chars("hello\nworld", "test").is_err());
    }

    #[test]
    fn test_reject_control_chars_del() {
        assert!(reject_control_chars("hello\x7Fworld", "test").is_err());
    }

    // -- encode_path_segment --------------------------------------------------

    #[test]
    fn test_encode_path_segment_plain_id() {
        assert_eq!(encode_path_segment("abc123"), "abc123");
    }

    #[test]
    fn test_encode_path_segment_hyphenated_id() {
        // Hyphens and underscores are unreserved (RFC 3986 §2.3) and common in
        // resource IDs (UUIDs, slugs). They must not be percent-encoded.
        assert_eq!(encode_path_segment("file-123"), "file-123");
        assert_eq!(encode_path_segment("my_resource_id"), "my_resource_id");
        assert_eq!(
            encode_path_segment("550e8400-e29b-41d4-a716-446655440000"),
            "550e8400-e29b-41d4-a716-446655440000"
        );
    }

    #[test]
    fn test_encode_path_segment_email() {
        // Calendar IDs are often email addresses. `@` is a reserved
        // character and must be encoded; `.` is unreserved per RFC 3986
        // §2.3 and must NOT be encoded.
        let encoded = encode_path_segment("user@gmail.com");
        assert!(!encoded.contains('@'), "@ must be percent-encoded");
        assert!(encoded.contains('.'), ". is unreserved and must not be encoded");
        assert_eq!(encoded, "user%40gmail.com");
    }

    #[test]
    fn test_encode_path_segment_dot_and_tilde_unreserved() {
        // `.` and `~` are RFC 3986 §2.3 unreserved characters and must
        // not be percent-encoded in path segments.
        assert_eq!(encode_path_segment("file.txt"), "file.txt");
        assert_eq!(encode_path_segment("user~archive"), "user~archive");
        assert_eq!(
            encode_path_segment("codex-test@agentmail.to"),
            "codex-test%40agentmail.to"
        );
    }

    #[test]
    fn test_encode_path_segment_query_injection() {
        // LLM might include query params in an ID by mistake
        let encoded = encode_path_segment("fileid?fields=name");
        assert!(!encoded.contains('?'));
        assert!(!encoded.contains('='));
    }

    #[test]
    fn test_encode_path_segment_fragment_injection() {
        let encoded = encode_path_segment("fileid#section");
        assert!(!encoded.contains('#'));
    }

    #[test]
    fn test_encode_path_segment_dot_segment_guard() {
        // `.` and `~` pass through unencoded (RFC 3986 §2.3 unreserved).
        assert_eq!(encode_path_segment("file.txt"), "file.txt");
        assert_eq!(encode_path_segment("..."), "...");
        assert_eq!(encode_path_segment(".hidden"), ".hidden");
        // Bare `.` and `..` also pass through from the encoder — WHATWG
        // dot-segment rejection must happen at the caller, not here.
        assert_eq!(encode_path_segment("."), ".");
        assert_eq!(encode_path_segment(".."), "..");
    }

    #[test]
    fn test_is_dot_segment() {
        assert!(is_dot_segment("."));
        assert!(is_dot_segment(".."));
        assert!(!is_dot_segment("..."));
        assert!(!is_dot_segment(".hidden"));
        assert!(!is_dot_segment("file.txt"));
        assert!(!is_dot_segment(""));
    }

    #[test]
    fn test_encode_path_segment_path_traversal() {
        // Encoding `/` makes traversal harmless — the path cannot escape
        // the segment even though `.` is left unencoded (unreserved).
        let encoded = encode_path_segment("../../etc/passwd");
        assert!(!encoded.contains('/'), "slashes must be encoded");
        assert_eq!(encoded, "..%2F..%2Fetc%2Fpasswd");
    }

    #[test]
    fn test_encode_path_segment_unicode() {
        // LLM might pass unicode characters
        let encoded = encode_path_segment("日本語ID");
        assert!(!encoded.contains('日'));
    }

    #[test]
    fn test_encode_path_segment_spaces() {
        let encoded = encode_path_segment("my file id");
        assert!(!encoded.contains(' '));
    }

    #[test]
    fn test_encode_path_segment_already_encoded() {
        // LLM might double-encode by passing pre-encoded values
        let encoded = encode_path_segment("user%40gmail.com");
        // The % itself gets encoded to %25, so %40 becomes %2540
        // This prevents double-encoding issues at the HTTP layer
        assert!(encoded.contains("%2540"));
    }

    #[test]
    fn test_encode_path_preserving_slashes_hierarchical_name() {
        let encoded = encode_path_preserving_slashes("projects/p1/locations/us/topics/t1");
        assert_eq!(encoded, "projects/p1/locations/us/topics/t1");
    }

    #[test]
    fn test_encode_path_preserving_slashes_escapes_reserved_chars() {
        let encoded = encode_path_preserving_slashes("hash#1/child?x=y");
        assert_eq!(encoded, "hash%231/child%3Fx%3Dy");
    }

    #[test]
    fn test_encode_path_preserving_slashes_spaces_and_unicode() {
        let encoded = encode_path_preserving_slashes("タイムライン 1/列 A");
        assert!(!encoded.contains(' '));
        assert!(encoded.contains('/'));
    }

    // -- validate_resource_name -----------------------------------------------

    #[test]
    fn test_validate_resource_name_valid() {
        assert!(validate_resource_name("spaces/ABC123").is_ok());
        assert!(validate_resource_name("subscriptions/my-sub").is_ok());
        assert!(validate_resource_name("@default").is_ok());
        assert!(validate_resource_name("projects/p1/topics/t1").is_ok());
    }

    #[test]
    fn test_validate_resource_name_traversal() {
        assert!(validate_resource_name("../../etc/passwd").is_err());
        assert!(validate_resource_name("spaces/../other").is_err());
        assert!(validate_resource_name("..").is_err());
    }

    #[test]
    fn test_validate_resource_name_single_dot() {
        assert!(validate_resource_name(".").is_err());
        assert!(validate_resource_name("projects/./topics/t1").is_err());
        // Dots inside segment names are fine
        assert!(validate_resource_name("file.txt").is_ok());
        assert!(validate_resource_name("user@mail.co").is_ok());
    }

    #[test]
    fn test_validate_resource_name_control_chars() {
        assert!(validate_resource_name("spaces/\0bad").is_err());
        assert!(validate_resource_name("spaces/\nbad").is_err());
        assert!(validate_resource_name("spaces/\rbad").is_err());
        assert!(validate_resource_name("spaces/\tbad").is_err());
    }

    #[test]
    fn test_validate_resource_name_empty() {
        assert!(validate_resource_name("").is_err());
    }

    #[test]
    fn test_validate_resource_name_query_injection() {
        // LLMs might append query strings or fragments to resource names
        assert!(validate_resource_name("spaces/ABC?key=val").is_err());
        assert!(validate_resource_name("spaces/ABC#fragment").is_err());
    }

    #[test]
    fn test_validate_resource_name_error_messages_are_clear() {
        let err = validate_resource_name("").unwrap_err();
        assert!(err.to_string().contains("must not be empty"));

        let err = validate_resource_name("../bad").unwrap_err();
        assert!(err.to_string().contains("dot-segment"));

        let err = validate_resource_name("bad\0id").unwrap_err();
        assert!(err.to_string().contains("invalid characters"));
    }

    #[test]
    fn test_validate_resource_name_percent_bypass() {
        // %2e%2e is ..
        assert!(validate_resource_name("%2e%2e").is_err());
        assert!(validate_resource_name("spaces/%2e%2e/etc").is_err());
        // Just % should be rejected too
        assert!(validate_resource_name("spaces/100%").is_err());
    }

    // --- reject_control_chars Unicode ---

    #[test]
    fn test_reject_control_chars_zero_width_space() {
        // U+200B zero-width space
        assert!(reject_control_chars("foo\u{200B}bar", "test").is_err());
    }

    #[test]
    fn test_reject_control_chars_bom() {
        // U+FEFF byte-order mark / zero-width no-break space
        assert!(reject_control_chars("foo\u{FEFF}bar", "test").is_err());
    }

    #[test]
    fn test_reject_control_chars_rtl_override() {
        // U+202E RIGHT-TO-LEFT OVERRIDE
        assert!(reject_control_chars("foo\u{202E}bar", "test").is_err());
    }

    #[test]
    fn test_reject_control_chars_unicode_line_separator() {
        // U+2028 LINE SEPARATOR
        assert!(reject_control_chars("foo\u{2028}bar", "test").is_err());
    }

    #[test]
    fn test_reject_control_chars_paragraph_separator() {
        // U+2029 PARAGRAPH SEPARATOR
        assert!(reject_control_chars("foo\u{2029}bar", "test").is_err());
    }

    #[test]
    fn test_reject_control_chars_zero_width_joiner() {
        // U+200D ZERO WIDTH JOINER
        assert!(reject_control_chars("foo\u{200D}bar", "test").is_err());
    }

    #[test]
    fn test_reject_control_chars_normal_unicode_ok() {
        // CJK, accented characters and emoji should pass
        assert!(reject_control_chars("日本語", "test").is_ok());
        assert!(reject_control_chars("café", "test").is_ok());
        assert!(reject_control_chars("αβγ", "test").is_ok());
    }

    // --- path validator Unicode (via validate_safe_output_dir) ---

    #[test]
    fn test_output_dir_rejects_zero_width_chars() {
        // U+200B in a path segment
        assert!(validate_safe_output_dir("foo\u{200B}bar").is_err());
    }

    #[test]
    fn test_output_dir_rejects_rtl_override() {
        assert!(validate_safe_output_dir("foo\u{202E}bar").is_err());
    }

    #[test]
    fn test_output_dir_rejects_unicode_line_separator() {
        assert!(validate_safe_output_dir("foo\u{2028}bar").is_err());
    }

    // --- validate_resource_name Unicode ---

    #[test]
    fn test_validate_resource_name_zero_width_chars() {
        // U+200B, U+200D, U+FEFF all rejected
        assert!(validate_resource_name("foo\u{200B}bar").is_err());
        assert!(validate_resource_name("foo\u{200D}bar").is_err());
        assert!(validate_resource_name("foo\u{FEFF}bar").is_err());
    }

    #[test]
    fn test_validate_resource_name_unicode_line_seps() {
        assert!(validate_resource_name("foo\u{2028}bar").is_err());
        assert!(validate_resource_name("foo\u{2029}bar").is_err());
    }

    #[test]
    fn test_validate_resource_name_rtl_override() {
        assert!(validate_resource_name("foo\u{202E}bar").is_err());
    }

    #[test]
    fn test_validate_resource_name_bidi_embedding() {
        // U+202A LEFT-TO-RIGHT EMBEDDING, U+202B RIGHT-TO-LEFT EMBEDDING
        assert!(validate_resource_name("foo\u{202A}bar").is_err());
        assert!(validate_resource_name("foo\u{202B}bar").is_err());
    }

    #[test]
    fn test_validate_resource_name_homoglyphs_pass_through() {
        // Cyrillic lookalikes are intentionally allowed (homoglyph detection
        // is out of scope for this validator — see validate_resource_name docs).
        assert!(validate_resource_name("spaces/ΑΒС").is_ok()); // Cyrillic С
    }

    #[test]
    fn test_validate_resource_name_overlong_accepted() {
        // No length limit — documents current behaviour.
        let long = "a".repeat(10_000);
        assert!(validate_resource_name(&long).is_ok());
    }

    // --- validate_api_identifier ---

    #[test]
    fn test_validate_api_identifier_valid() {
        assert_eq!(validate_api_identifier("drive").unwrap(), "drive");
        assert_eq!(validate_api_identifier("v3").unwrap(), "v3");
        assert_eq!(
            validate_api_identifier("directory_v1").unwrap(),
            "directory_v1"
        );
        assert_eq!(
            validate_api_identifier("admin.reports_v1").unwrap(),
            "admin.reports_v1"
        );
        assert_eq!(validate_api_identifier("v2beta1").unwrap(), "v2beta1");
    }

    #[test]
    fn test_validate_api_identifier_rejects_path_traversal() {
        assert!(validate_api_identifier("../etc/passwd").is_err());
        assert!(validate_api_identifier("foo/../bar").is_err());
    }

    #[test]
    fn test_validate_api_identifier_rejects_special_chars() {
        assert!(validate_api_identifier("drive?key=val").is_err());
        assert!(validate_api_identifier("drive#frag").is_err());
        assert!(validate_api_identifier("drive%2f..").is_err());
        assert!(validate_api_identifier("v3 ").is_err());
        assert!(validate_api_identifier("v3\n").is_err());
    }

    #[test]
    fn test_validate_api_identifier_empty() {
        assert!(validate_api_identifier("").is_err());
    }

    // --- validate_safe_file_path ---

    #[test]
    #[serial]
    fn test_file_path_relative_is_ok() {
        let dir = tempdir().unwrap();
        let canonical_dir = dir.path().canonicalize().unwrap();
        fs::write(canonical_dir.join("test.txt"), "data").unwrap();

        let saved_cwd = std::env::current_dir().unwrap();
        std::env::set_current_dir(&canonical_dir).unwrap();

        let result = validate_safe_file_path("test.txt", "--upload");
        std::env::set_current_dir(&saved_cwd).unwrap();

        assert!(result.is_ok(), "expected Ok, got: {result:?}");
    }

    #[test]
    #[serial]
    fn test_file_path_rejects_traversal() {
        let dir = tempdir().unwrap();
        let canonical_dir = dir.path().canonicalize().unwrap();

        let saved_cwd = std::env::current_dir().unwrap();
        std::env::set_current_dir(&canonical_dir).unwrap();

        let result = validate_safe_file_path("../../etc/passwd", "--upload");
        std::env::set_current_dir(&saved_cwd).unwrap();

        assert!(result.is_err(), "path traversal should be rejected");
        let err = result.unwrap_err().to_string();
        // The traversal is rejected either by the "outside CWD" check (if the
        // computed parent exists and canonicalizes outside CWD) or by the
        // "parent does not exist" check (if the computed parent doesn't exist
        // on this runner). Both are valid refusal paths — the security
        // property is "not accepted", not the message wording.
        assert!(
            err.contains("outside") || err.contains("does not exist"),
            "error should indicate traversal/non-existent parent rejection; got: {err}"
        );
    }

    #[test]
    fn test_file_path_rejects_control_chars() {
        let result = validate_safe_file_path("file\x00.txt", "--output");
        assert!(result.is_err(), "null bytes should be rejected");
    }

    #[test]
    #[serial]
    fn test_file_path_rejects_symlink_escape() {
        let dir = tempdir().unwrap();
        let canonical_dir = dir.path().canonicalize().unwrap();

        // Create a symlink that points outside the directory
        #[cfg(unix)]
        {
            let link_path = canonical_dir.join("escape");
            std::os::unix::fs::symlink("/tmp", &link_path).unwrap();

            let saved_cwd = std::env::current_dir().unwrap();
            std::env::set_current_dir(&canonical_dir).unwrap();

            let result = validate_safe_file_path("escape/secret.txt", "--output");
            std::env::set_current_dir(&saved_cwd).unwrap();

            assert!(result.is_err(), "symlink escape should be rejected");
        }
    }

    // -- encode_query_component ----------------------------------------------

    #[test]
    fn encode_query_component_encodes_space_as_percent20() {
        assert_eq!(encode_query_component("a b"), "a%20b");
    }

    #[test]
    fn encode_query_component_encodes_reserved_chars() {
        assert_eq!(encode_query_component("a&b=c#d"), "a%26b%3Dc%23d");
        assert_eq!(encode_query_component("a+b"), "a%2Bb");
        assert_eq!(encode_query_component("a/b"), "a%2Fb");
        assert_eq!(encode_query_component("a?b"), "a%3Fb");
        assert_eq!(encode_query_component("a|b"), "a%7Cb");
    }

    #[test]
    fn encode_query_component_unreserved_passes_through() {
        // RFC 3986 unreserved set plus `,` — all should be literal.
        assert_eq!(encode_query_component("Aa0-_.~,"), "Aa0-_.~,");
    }

    #[test]
    fn encode_query_component_encodes_control_chars() {
        let encoded = encode_query_component("a\x01\x1Fb");
        assert!(encoded.contains("%01"));
        assert!(encoded.contains("%1F"));
        assert!(!encoded.contains('\x01'));
    }

    #[test]
    fn encode_query_component_encodes_adversarial_agent_id() {
        // The signature edge case from the acceptance criteria — agent_id
        // with `/`, `?`, `&` must encode to `bad%2Fid%3Ffoo%26bar` so it
        // cannot leak extra query parameters into the connect URL.
        assert_eq!(
            encode_query_component("bad/id?foo&bar"),
            "bad%2Fid%3Ffoo%26bar",
        );
    }

    #[test]
    #[serial]
    fn test_file_path_rejects_traversal_via_nonexistent_prefix() {
        // Regression: non_existent/../../etc/passwd could bypass starts_with
        // because normalize_non_existing preserves ".." in the non-existent
        // suffix. The normalize_dotdot fix resolves this.
        let dir = tempdir().unwrap();
        let canonical_dir = dir.path().canonicalize().unwrap();

        let saved_cwd = std::env::current_dir().unwrap();
        std::env::set_current_dir(&canonical_dir).unwrap();

        let result = validate_safe_file_path("doesnt_exist/../../etc/passwd", "--output");
        std::env::set_current_dir(&saved_cwd).unwrap();

        assert!(
            result.is_err(),
            "traversal via non-existent prefix should be rejected"
        );
    }
}
