//! Path-addressed hook registries for the root [`CliApp`].
//!
//! Hooks are registered against glob-style paths in the command tree
//! (e.g. `&["users", "**"]` fires for every operation under `users`).
//! The registry stores boxed async callbacks and matches them at
//! dispatch time.

use serde_json::Value;

use crate::binding::BoxFuture;
use crate::error::CliError;

// ── Pattern matching ────────────────────────────────────────────────

/// A compiled path pattern. Segments are literal strings; `*` matches
/// one segment; `**` matches zero or more segments.
#[derive(Debug, Clone)]
pub struct PathPattern {
    segments: Vec<PatternSegment>,
}

#[derive(Debug, Clone)]
enum PatternSegment {
    Literal(String),
    Single,   // *
    Globstar, // **
}

impl PathPattern {
    pub fn new(segments: &[&str]) -> Self {
        Self {
            segments: segments
                .iter()
                .map(|s| match *s {
                    "**" => PatternSegment::Globstar,
                    "*" => PatternSegment::Single,
                    lit => PatternSegment::Literal(lit.to_string()),
                })
                .collect(),
        }
    }

    /// Returns `true` if `path` matches this pattern.
    pub fn matches(&self, path: &[String]) -> bool {
        Self::do_match(&self.segments, path)
    }

    fn do_match(pattern: &[PatternSegment], path: &[String]) -> bool {
        match (pattern.first(), path.first()) {
            (None, None) => true,
            (None, Some(_)) => false,
            (Some(PatternSegment::Globstar), _) => {
                // ** can match zero segments (skip globstar) or one
                // segment (consume one path element, keep globstar).
                Self::do_match(&pattern[1..], path)
                    || (!path.is_empty() && Self::do_match(pattern, &path[1..]))
            }
            (Some(_), None) => {
                // Remaining pattern segments with no path left — only
                // matches if all remaining are globstars.
                pattern.iter().all(|s| matches!(s, PatternSegment::Globstar))
            }
            (Some(PatternSegment::Literal(lit)), Some(seg)) => {
                lit == seg && Self::do_match(&pattern[1..], &path[1..])
            }
            (Some(PatternSegment::Single), Some(_)) => {
                Self::do_match(&pattern[1..], &path[1..])
            }
        }
    }
}

// ── Hook storage ────────────────────────────────────────────────────

/// A `transform_response` callback: `(Value, op_path) -> Result<Value>`.
pub type TransformResponseFn =
    Box<dyn Fn(Value, Vec<String>) -> BoxFuture<'static, Result<Value, CliError>> + Send + Sync>;

/// A `recover_error` callback: `(CliError, op_path) -> Result<Option<Value>>`.
/// Returning `Ok(Some(v))` short-circuits with `v` as the response;
/// `Ok(None)` lets the error propagate to the next hook or default path.
pub type RecoverErrorFn = Box<
    dyn Fn(CliError, Vec<String>) -> BoxFuture<'static, Result<Option<Value>, CliError>>
        + Send
        + Sync,
>;

/// A path-addressed hook entry.
pub(crate) struct HookEntry<F> {
    pattern: PathPattern,
    callback: F,
}

/// Registry of spec-level hooks registered on the root `CliApp`.
#[derive(Default)]
pub struct HookRegistry {
    transform_response: Vec<HookEntry<TransformResponseFn>>,
    recover_error: Vec<HookEntry<RecoverErrorFn>>,
}

impl HookRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add_transform_response(&mut self, path: &[&str], f: TransformResponseFn) {
        self.transform_response.push(HookEntry {
            pattern: PathPattern::new(path),
            callback: f,
        });
    }

    pub fn add_recover_error(&mut self, path: &[&str], f: RecoverErrorFn) {
        self.recover_error.push(HookEntry {
            pattern: PathPattern::new(path),
            callback: f,
        });
    }

    /// Run matching `transform_response` hooks in registration order.
    pub async fn run_transform_response(
        &self,
        mut value: Value,
        op_path: &[String],
    ) -> Result<Value, CliError> {
        for entry in &self.transform_response {
            if entry.pattern.matches(op_path) {
                value = (entry.callback)(value, op_path.to_vec()).await?;
            }
        }
        Ok(value)
    }

    /// Run matching `recover_error` hooks in registration order.
    /// First `Ok(Some(v))` wins; `Ok(None)` defers to the next hook.
    ///
    /// The original error is duplicated before being passed to each
    /// hook, so declining hooks (`Ok(None)`) do not destroy the error
    /// for subsequent hooks or the final error path.
    pub async fn run_recover_error(
        &self,
        err: CliError,
        op_path: &[String],
    ) -> Result<Value, CliError> {
        let mut current_err = err;
        for entry in &self.recover_error {
            if entry.pattern.matches(op_path) {
                // Duplicate before passing to the callback so the
                // original is preserved if the hook declines.
                let err_for_hook = current_err.duplicate();
                match (entry.callback)(err_for_hook, op_path.to_vec()).await {
                    Ok(Some(value)) => return Ok(value),
                    Ok(None) => {
                        // Hook declined — original error preserved
                        // via duplicate() above; current_err unchanged.
                    }
                    Err(new_err) => {
                        current_err = new_err;
                    }
                }
            }
        }
        Err(current_err)
    }

    pub fn is_empty(&self) -> bool {
        self.transform_response.is_empty() && self.recover_error.is_empty()
    }

    /// Returns `true` if at least one `recover_error` hook is registered.
    pub fn has_recover_error(&self) -> bool {
        !self.recover_error.is_empty()
    }

    /// Validate that every registered hook pattern matches at least one
    /// leaf command in the given command tree. Returns an error listing
    /// all unmatched patterns.
    pub fn validate_patterns(&self, cmd: &clap::Command) -> Result<(), crate::error::CliError> {
        if self.is_empty() {
            return Ok(());
        }
        let leaves = collect_leaf_paths(cmd, &mut Vec::new());
        let mut unmatched = Vec::new();
        for entry in &self.transform_response {
            if !leaves.iter().any(|leaf| entry.pattern.matches(leaf)) {
                unmatched.push(format!(
                    "transform_response pattern {:?} matches no operations",
                    pattern_to_strings(&entry.pattern),
                ));
            }
        }
        for entry in &self.recover_error {
            if !leaves.iter().any(|leaf| entry.pattern.matches(leaf)) {
                unmatched.push(format!(
                    "recover_error pattern {:?} matches no operations",
                    pattern_to_strings(&entry.pattern),
                ));
            }
        }
        if unmatched.is_empty() {
            Ok(())
        } else {
            Err(crate::error::CliError::Validation(unmatched.join("; ")))
        }
    }
}

/// Recursively collect all leaf command paths (commands with no
/// subcommands). Includes hidden commands so that `.hide()` followed by
/// a hook on the hidden path does not produce a false validation error.
fn collect_leaf_paths(cmd: &clap::Command, prefix: &mut Vec<String>) -> Vec<Vec<String>> {
    let subs: Vec<_> = cmd.get_subcommands().collect();
    if subs.is_empty() {
        return vec![prefix.clone()];
    }
    let mut leaves = Vec::new();
    for sub in subs {
        let name = sub.get_name().to_string();
        // Skip built-in utility commands and binding-internal
        // subcommands that bypass the hook pipeline.
        if name == "help" || name == "completion" || name == "man"
            || name == "generate-skills"
        {
            continue;
        }
        prefix.push(name);
        leaves.extend(collect_leaf_paths(sub, prefix));
        prefix.pop();
    }
    leaves
}

/// Extract display-friendly strings from a pattern for error messages.
fn pattern_to_strings(pattern: &PathPattern) -> Vec<String> {
    pattern.segments.iter().map(|s| match s {
        PatternSegment::Literal(lit) => lit.clone(),
        PatternSegment::Single => "*".to_string(),
        PatternSegment::Globstar => "**".to_string(),
    }).collect()
}

// ── Tests ───────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pattern_exact_match() {
        let p = PathPattern::new(&["users", "get"]);
        assert!(p.matches(&["users".into(), "get".into()]));
        assert!(!p.matches(&["users".into()]));
        assert!(!p.matches(&["users".into(), "get".into(), "extra".into()]));
    }

    #[test]
    fn pattern_single_wildcard() {
        let p = PathPattern::new(&["users", "*"]);
        assert!(p.matches(&["users".into(), "get".into()]));
        assert!(p.matches(&["users".into(), "list".into()]));
        assert!(!p.matches(&["users".into()]));
        assert!(!p.matches(&["users".into(), "get".into(), "extra".into()]));
    }

    #[test]
    fn pattern_globstar() {
        let p = PathPattern::new(&["**"]);
        assert!(p.matches(&[]));
        assert!(p.matches(&["users".into()]));
        assert!(p.matches(&["users".into(), "get".into()]));
    }

    #[test]
    fn pattern_globstar_prefix() {
        let p = PathPattern::new(&["users", "**"]);
        assert!(p.matches(&["users".into()]));
        assert!(p.matches(&["users".into(), "get".into()]));
        assert!(p.matches(&["users".into(), "a".into(), "b".into()]));
        assert!(!p.matches(&["posts".into()]));
    }

    #[test]
    fn pattern_globstar_suffix() {
        let p = PathPattern::new(&["**", "list"]);
        assert!(p.matches(&["list".into()]));
        assert!(p.matches(&["users".into(), "list".into()]));
        assert!(p.matches(&["a".into(), "b".into(), "list".into()]));
        assert!(!p.matches(&["users".into(), "get".into()]));
    }

    #[test]
    fn pattern_empty() {
        let p = PathPattern::new(&[]);
        assert!(p.matches(&[]));
        assert!(!p.matches(&["a".into()]));
    }
}
