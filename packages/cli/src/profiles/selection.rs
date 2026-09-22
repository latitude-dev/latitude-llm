//! Deciding *which* profile an invocation runs under, and publishing the
//! answer for the rest of the process.
//!
//! Resolution happens in `CliApp::run` **before** clap parses the
//! subcommand, alongside the existing pre-parse interception in
//! [`crate::early_intercept`] — the resolved profile has to be in place
//! before the clap tree is built, because it supplies `default_value`s to
//! the args in that tree.

use std::sync::{Arc, OnceLock, RwLock};

use crate::error::CliError;
use crate::profiles::store::{self, ProfileStore, ResolvedProfile};

/// Where the selected profile came from. Reported by `profiles current` and
/// in the "unknown profile" error, so a user who forgot they exported
/// `<BIN>_PROFILE` can see why they are on a tenant they did not name.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SelectionSource {
    /// `--profile` / `-p` on the command line.
    Flag,
    /// The `<BIN>_PROFILE` environment variable.
    Env,
    /// `active = "..."` in `profiles.toml`, set by `profiles use`.
    Active,
}

impl SelectionSource {
    pub fn label(self) -> &'static str {
        match self {
            SelectionSource::Flag => "--profile flag",
            SelectionSource::Env => "environment variable",
            SelectionSource::Active => "active profile",
        }
    }
}

/// A resolved profile plus how it was chosen.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Selection {
    pub profile: ResolvedProfile,
    pub source: SelectionSource,
}

/// The env var that names a profile, e.g. `TWILIO_PROFILE`. Same derivation
/// as `<NAME>_LOG` / `<NAME>_OUTPUT`.
pub fn profile_env_var(cli_name: &str) -> String {
    format!("{}_PROFILE", cli_name.to_uppercase().replace('-', "_"))
}

/// The long flag name. A constant rather than an inline literal so the
/// pre-clap scanner and the clap registration cannot drift.
pub const PROFILE_FLAG: &str = "profile";

/// `-p` is safe as the short form: spec-derived parameter args are
/// `.long()`-only (see `openapi::commands`), so there is no short-flag
/// namespace for it to collide in.
pub const PROFILE_SHORT: char = 'p';

// ── Pre-clap flag extraction ────────────────────────────────────────────

/// The value of `--profile` / `-p` in raw argv, if present.
///
/// Sniffed pre-clap for the same reason `--schema` is: the profile has to be
/// known before the command tree is built, and clap would demand the matched
/// leaf's required args before we ever got a chance to look.
///
/// Accepts every spelling clap does: `--profile v`, `--profile=v`, `-p v`,
/// `-p=v`, `-pv`. Stops at a bare `--`, after which everything is
/// positional.
///
/// Like the other raw-argv scanners in this crate, this cannot tell a flag
/// from a *value* that happens to look like one (`--body --profile`). The
/// exposure is the same as for `--schema` / `--base-url`, and the real parse
/// still happens in clap.
pub fn extract_profile_flag(args: &[String]) -> Option<String> {
    let long = format!("--{PROFILE_FLAG}");
    let long_eq = format!("{long}=");

    let mut iter = args.iter().skip(1);
    while let Some(arg) = iter.next() {
        if arg == "--" {
            return None;
        }
        if let Some(value) = arg.strip_prefix(&long_eq) {
            return non_empty(value);
        }
        if arg == &long {
            return iter.next().and_then(|v| non_empty(v));
        }
        // Short forms, including bundles. Clap combines short flags, so `-qp
        // acme` is `-q` plus `-p acme` — and missing that spelling did not
        // fail, it silently ran the command against the *active* profile
        // while clap happily bound `profile=acme`. Sending a request to the
        // wrong tenant with exit 0 is the worst outcome this feature has, so
        // the scanner has to accept every cluster clap does.
        if let Some(value) = short_flag_value(arg, &mut iter) {
            return value;
        }
    }
    None
}

/// Pull `-p`'s value out of a short-flag token, which may be a bundle.
///
/// Handles `-p v`, `-p=v`, `-pv`, `-qp v`, `-qpv`. Returns `None` when the
/// token is not a short cluster containing `p` — a long flag, a bare `--`, or
/// a negative number (`--limit -5`) — so the caller keeps scanning.
///
/// `Some(None)` means the cluster named `p` but no usable value followed;
/// that is still a match, and falling through to a later `-p` would be wrong.
fn short_flag_value<'a>(
    arg: &str,
    iter: &mut impl Iterator<Item = &'a String>,
) -> Option<Option<String>> {
    let cluster = arg.strip_prefix('-')?;
    if cluster.is_empty() || cluster.starts_with('-') {
        return None;
    }
    let index = cluster.find(PROFILE_SHORT)?;
    // Everything before `p` has to look like short flags, or this is a value
    // that merely contains the letter (`-5p`, `-x=p`) rather than a cluster.
    if !cluster[..index].chars().all(|c| c.is_ascii_alphanumeric()) {
        return None;
    }
    let rest = &cluster[index + PROFILE_SHORT.len_utf8()..];
    if rest.is_empty() {
        // `-p` / `-qp` — the value is the next argv entry.
        return Some(iter.next().and_then(|v| non_empty(v)));
    }
    if let Some(value) = rest.strip_prefix('=') {
        // `-p=acme` / `-qp=acme`.
        return Some(non_empty(value));
    }
    if rest.starts_with('-') {
        // `-p-x` is a cluster naming another flag, not `--profile -x`.
        // Preserved from the original scanner; keep scanning.
        return None;
    }
    // `-pacme` / `-qpacme`.
    Some(non_empty(rest))
}

fn non_empty(s: &str) -> Option<String> {
    let trimmed = s.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

// ── Resolution ──────────────────────────────────────────────────────────

/// Resolve the profile for this invocation.
///
/// ```text
/// --profile / -p  →  <BIN>_PROFILE  →  active in profiles.toml  →  None
/// ```
///
/// `Ok(None)` means "no profile", which is not an error — it is the state
/// every existing generated CLI is in, and it must behave exactly as before.
///
/// A profile that is *named* but absent is always an error, never a silent
/// fallthrough to env vars. Falling through would send the request with the
/// caller's default credentials against a tenant they did not choose, and
/// they would not find out until they read the response.
pub fn resolve_selection(
    cli_name: &str,
    args: &[String],
) -> Result<Option<Selection>, CliError> {
    let store = match ProfileStore::for_cli(cli_name) {
        Some(store) => store,
        // No home directory — no profiles, same as an empty file.
        None => return Ok(None),
    };
    resolve_selection_in(&store, cli_name, args)
}

/// [`resolve_selection`] against an explicit store. The unit-testable seam.
pub fn resolve_selection_in(
    store: &ProfileStore,
    cli_name: &str,
    args: &[String],
) -> Result<Option<Selection>, CliError> {
    let (name, source) = if let Some(name) = extract_profile_flag(args) {
        (name, SelectionSource::Flag)
    } else if let Some(name) = std::env::var(profile_env_var(cli_name))
        .ok()
        .and_then(|v| non_empty(&v))
    {
        (name, SelectionSource::Env)
    } else if let Some(name) = store.active() {
        (name.to_string(), SelectionSource::Active)
    } else {
        return Ok(None);
    };

    let profile = store::resolve(store, &name).map_err(|e| annotate(e, source, cli_name))?;
    Ok(Some(Selection { profile, source }))
}

/// Say where the offending name came from. An error about `-p nope` is
/// self-explanatory; the same error from a stale `active` or an exported
/// `TWILIO_PROFILE` is not.
fn annotate(error: CliError, source: SelectionSource, cli_name: &str) -> CliError {
    let hint = match source {
        SelectionSource::Flag => return error,
        SelectionSource::Env => format!(
            " (named by the {} environment variable)",
            profile_env_var(cli_name),
        ),
        SelectionSource::Active => format!(
            " (the active profile — run `{cli_name} profiles use <name>` to change it)",
        ),
    };
    match error {
        CliError::Validation(message) => CliError::Validation(format!("{message}{hint}")),
        other => other,
    }
}

// ── Flag reservation ────────────────────────────────────────────────────

/// Whether this binary registers the global `--profile` / `-p` flag.
///
/// Set once by `CliApp::profiles(...)`. Read by the collision-avoidance
/// machinery in `openapi::commands` / `openapi::app`, which has to know that
/// `profile` is a taken arg id before it registers a spec-derived flag under
/// the same name.
///
/// A process-global rather than a plumbed parameter for the same reason
/// [`crate::user_agent::SUFFIX_FLAG`](crate::user_agent) is one: the
/// consumers are `const`-driven pure functions several layers below the
/// builder, and the value is fixed for the process.
static PROFILE_FLAG_REGISTERED: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

/// Record that this binary exposes `--profile`. Called from
/// `CliApp::profiles(...)`.
pub fn reserve_profile_flag() {
    PROFILE_FLAG_REGISTERED.store(true, std::sync::atomic::Ordering::Relaxed);
}

/// True when `flag` would collide with the global `--profile` flag *and*
/// this binary actually registers it.
///
/// Gated on registration because profiles are opt-in: reserving the name
/// unconditionally would rename a spec parameter's flag (`--profile` →
/// `--profile-param`) on every CLI that has such a parameter and no
/// profiles, which is a breaking change for an existing consumer.
pub fn collides_with_profile_flag(flag: &str) -> bool {
    flag == PROFILE_FLAG && PROFILE_FLAG_REGISTERED.load(std::sync::atomic::Ordering::Relaxed)
}

/// Undo [`reserve_profile_flag`]. Test-only: the marker is process-global,
/// so a test that enables profiles would otherwise leak the reservation into
/// every later test in the same binary.
#[cfg(test)]
pub fn release_profile_flag_for_tests() {
    PROFILE_FLAG_REGISTERED.store(false, std::sync::atomic::Ordering::Relaxed);
}

// ── Process-global slot ─────────────────────────────────────────────────

/// The resolved profile for this process, installed once by `CliApp::run`.
///
/// `OnceLock<RwLock<…>>` rather than a plain `OnceLock` so tests can swap
/// it — exactly the shape
/// [`crate::auth::keyring_store::ACTIVE_STORE`](crate::auth::keyring_store)
/// uses, and for the same reason.
static ACTIVE_PROFILE: OnceLock<RwLock<Option<(Arc<ResolvedProfile>, SelectionSource)>>> =
    OnceLock::new();

#[allow(clippy::type_complexity)]
fn slot() -> &'static RwLock<Option<(Arc<ResolvedProfile>, SelectionSource)>> {
    ACTIVE_PROFILE.get_or_init(|| RwLock::new(None))
}

/// Publish the resolved profile. Called by `CliApp::run` before
/// `propagate_root_auth`, because the keyring account and the OAuth
/// token-cache key are both derived from it at that point.
///
/// The [`SelectionSource`] rides along because precedence depends on it:
/// a profile named explicitly with `-p` outranks environment variables,
/// while an ambient one (the active profile, or `<BIN>_PROFILE`) does not.
/// See [`outranks_env`].
pub fn install(selection: Option<Selection>) {
    let mut guard = slot()
        .write()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    *guard = selection.map(|s| (Arc::new(s.profile), s.source));
}

/// The active profile, or `None` when the invocation is running unprofiled.
///
/// Returns an `Arc` clone: this is called once per registered clap arg while
/// the command tree is built, so cloning the maps each time would be
/// needless work on a hot-ish path.
pub fn active() -> Option<Arc<ResolvedProfile>> {
    slot()
        .read()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .as_ref()
        .map(|(profile, _)| Arc::clone(profile))
}

/// How the active profile was chosen, or `None` when running unprofiled.
pub fn active_source() -> Option<SelectionSource> {
    slot()
        .read()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .as_ref()
        .map(|(_, source)| *source)
}

/// Whether this invocation's profile takes precedence over environment
/// variables.
///
/// True only for `--profile` / `-p`. The reasoning is the difference between
/// *explicit* and *ambient*: `-p prod` was typed for this invocation and is
/// the most specific statement of intent available, so it beats an env var
/// the shell happened to export — which is how every other flag in this CLI
/// already behaves. The active profile and `<BIN>_PROFILE` are ambient: a
/// default chosen days ago, or a shell-wide setting. Those must lose to the
/// environment, which is what keeps a CI job's exported credentials from
/// being overridden by a developer's stored profile.
///
/// Matches the ordering Twilio's shipping CLI documents:
/// `-p` > environment variables > active profile.
pub fn outranks_env() -> bool {
    active_source() == Some(SelectionSource::Flag)
}

/// Install a profile from a test. Separate name so the production call site
/// is greppable and a test cannot be mistaken for one.
///
/// Defaults to [`SelectionSource::Active`] — the ambient case — so a test
/// that does not care about precedence gets the conservative behaviour.
/// Tests that use this must be `#[serial]`: the slot is process-global.
pub fn install_for_tests(profile: Option<ResolvedProfile>) {
    install_for_tests_from(profile, SelectionSource::Active);
}

/// [`install_for_tests`] with an explicit selection source, for tests that
/// exercise the `-p`-beats-env rung.
pub fn install_for_tests_from(profile: Option<ResolvedProfile>, source: SelectionSource) {
    install(profile.map(|profile| Selection { profile, source }));
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::profiles::store::{ProfileEntry, PROFILES_FILENAME};
    use serial_test::serial;

    fn args(slice: &[&str]) -> Vec<String> {
        slice.iter().map(|s| s.to_string()).collect()
    }

    // ── extract_profile_flag ────────────────────────────────────────────

    #[test]
    fn extracts_every_spelling_clap_accepts() {
        for spelling in [
            &["cli", "--profile", "prod", "users", "list"][..],
            &["cli", "--profile=prod", "users", "list"][..],
            &["cli", "-p", "prod", "users", "list"][..],
            &["cli", "-p=prod", "users", "list"][..],
            &["cli", "-pprod", "users", "list"][..],
            &["cli", "users", "list", "-p", "prod"][..],
        ] {
            assert_eq!(
                extract_profile_flag(&args(spelling)).as_deref(),
                Some("prod"),
                "failed for {spelling:?}",
            );
        }
    }

    #[test]
    fn absent_flag_yields_none() {
        assert_eq!(extract_profile_flag(&args(&["cli", "users", "list"])), None);
        // A dangling flag with no value is not a selection.
        assert_eq!(extract_profile_flag(&args(&["cli", "--profile"])), None);
        assert_eq!(extract_profile_flag(&args(&["cli", "--profile", ""])), None);
    }

    #[test]
    fn stops_at_the_double_dash_terminator() {
        assert_eq!(
            extract_profile_flag(&args(&["cli", "run", "--", "-p", "prod"])),
            None,
        );
    }

    #[test]
    fn reads_the_profile_out_of_a_short_flag_bundle() {
        // Clap combines short flags, so `-qp acme` is `-q` plus `-p acme`.
        // The scanner used to miss this: `"-qp".strip_prefix("-p")` is None.
        // It did not fail — the command ran against whatever profile was
        // already active, exit 0, wrong tenant, no warning. Verified against
        // a real generated CLI before the fix.
        for spelling in [
            &["cli", "-qp", "acme", "users", "list"][..],
            &["cli", "-qpacme", "users", "list"][..],
            &["cli", "-qp=acme", "users", "list"][..],
            &["cli", "users", "list", "-qp", "acme"][..],
        ] {
            assert_eq!(
                extract_profile_flag(&args(spelling)).as_deref(),
                Some("acme"),
                "failed for {spelling:?}",
            );
        }
    }

    #[test]
    fn a_value_that_merely_contains_p_is_not_a_bundle() {
        // Everything before `p` has to look like short flags, or a negative
        // number / operator-ish value would be read as a profile selection.
        for spelling in [
            &["cli", "--limit", "-5", "users", "list"][..],
            &["cli", "-x=p", "users", "list"][..],
        ] {
            assert_eq!(
                extract_profile_flag(&args(spelling)),
                None,
                "false positive for {spelling:?}",
            );
        }
    }

    #[test]
    fn does_not_confuse_a_longer_short_cluster_for_a_value() {
        // `-p-x` is not `--profile -x`.
        assert_eq!(extract_profile_flag(&args(&["cli", "-p-x"])), None);
    }

    // ── resolve_selection ───────────────────────────────────────────────

    fn store_with(entries: &[&str], active: Option<&str>) -> ProfileStore {
        let dir = tempfile::tempdir().unwrap();
        let mut store = ProfileStore::at_path(dir.path().join(PROFILES_FILENAME));
        for name in entries {
            store.upsert(&ProfileEntry {
                name: (*name).to_string(),
                ..Default::default()
            });
        }
        if let Some(name) = active {
            store.set_active(name);
        }
        std::mem::forget(dir);
        store
    }

    /// Run `f` with `<CLI>_PROFILE` set to `value`, restoring it after.
    fn with_env_profile<R>(cli: &str, value: Option<&str>, f: impl FnOnce() -> R) -> R {
        let key = profile_env_var(cli);
        let previous = std::env::var(&key).ok();
        match value {
            Some(v) => std::env::set_var(&key, v),
            None => std::env::remove_var(&key),
        }
        let result = f();
        match previous {
            Some(v) => std::env::set_var(&key, v),
            None => std::env::remove_var(&key),
        }
        result
    }

    #[test]
    #[serial]
    fn flag_beats_env_beats_active() {
        let store = store_with(&["flagged", "envd", "actived"], Some("actived"));
        with_env_profile("cli", Some("envd"), || {
            // Flag wins over both.
            let selected =
                resolve_selection_in(&store, "cli", &args(&["cli", "-p", "flagged"]))
                    .unwrap()
                    .unwrap();
            assert_eq!(selected.profile.name, "flagged");
            assert_eq!(selected.source, SelectionSource::Flag);

            // Env wins over active.
            let selected = resolve_selection_in(&store, "cli", &args(&["cli"]))
                .unwrap()
                .unwrap();
            assert_eq!(selected.profile.name, "envd");
            assert_eq!(selected.source, SelectionSource::Env);
        });

        // Active is the last rung.
        with_env_profile("cli", None, || {
            let selected = resolve_selection_in(&store, "cli", &args(&["cli"]))
                .unwrap()
                .unwrap();
            assert_eq!(selected.profile.name, "actived");
            assert_eq!(selected.source, SelectionSource::Active);
        });
    }

    #[test]
    #[serial]
    fn no_profile_configured_is_not_an_error() {
        // The compatibility guarantee: every existing generated CLI is here.
        let store = store_with(&[], None);
        with_env_profile("cli", None, || {
            assert!(resolve_selection_in(&store, "cli", &args(&["cli"]))
                .unwrap()
                .is_none());
        });
    }

    #[test]
    #[serial]
    fn named_but_missing_profile_errors_and_lists_the_known_ones() {
        // Never a silent fallthrough to env credentials — the request would
        // hit a tenant the caller did not choose.
        let store = store_with(&["prod", "staging"], None);
        with_env_profile("cli", None, || {
            let err = resolve_selection_in(&store, "cli", &args(&["cli", "-p", "nope"]))
                .unwrap_err()
                .to_string();
            assert!(err.contains("unknown profile `nope`"), "{err}");
            assert!(err.contains("prod, staging"), "{err}");
        });
    }

    #[test]
    #[serial]
    fn missing_profile_from_env_says_so() {
        let store = store_with(&["prod"], None);
        with_env_profile("cli", Some("ghost"), || {
            let err = resolve_selection_in(&store, "cli", &args(&["cli"]))
                .unwrap_err()
                .to_string();
            assert!(err.contains("CLI_PROFILE"), "{err}");
        });
    }

    #[test]
    #[serial]
    fn missing_active_profile_points_at_profiles_use() {
        let store = store_with(&["prod"], Some("prod"));
        // Simulate a hand-edited file whose `active` names a gone profile by
        // removing it without going through `remove`, which clears `active`.
        let mut store = store;
        store.set_active("ghost");
        with_env_profile("cli", None, || {
            let err = resolve_selection_in(&store, "cli", &args(&["cli"]))
                .unwrap_err()
                .to_string();
            assert!(err.contains("profiles use"), "{err}");
        });
    }

    // ── process-global slot ─────────────────────────────────────────────

    #[test]
    #[serial]
    fn install_and_read_back() {
        install(None);
        assert!(active().is_none());
        assert!(active_source().is_none());

        install(Some(Selection {
            profile: ResolvedProfile {
                name: "prod".to_string(),
                credential: Some("prod".to_string()),
                ..Default::default()
            },
            source: SelectionSource::Flag,
        }));
        assert_eq!(active().unwrap().name, "prod");
        assert_eq!(active_source(), Some(SelectionSource::Flag));

        // Swappable, so one test cannot leak into the next.
        install(None);
        assert!(active().is_none());
    }

    #[test]
    #[serial]
    fn only_an_explicitly_named_profile_outranks_env() {
        // Ambient selections must lose to the environment; that is what
        // keeps a CI job's exported credentials authoritative.
        for (source, expected) in [
            (SelectionSource::Flag, true),
            (SelectionSource::Env, false),
            (SelectionSource::Active, false),
        ] {
            install(Some(Selection {
                profile: ResolvedProfile {
                    name: "p".to_string(),
                    ..Default::default()
                },
                source,
            }));
            assert_eq!(outranks_env(), expected, "{source:?}");
        }
        install(None);
        assert!(!outranks_env(), "unprofiled never outranks env");
    }
}
