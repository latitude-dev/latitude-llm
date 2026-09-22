//! Login flows and the `auth` subcommand surface (`login` / `logout` / `status`).
//!
//! Three flow types live here as concrete builders implementing the
//! [`LoginFlow`] trait:
//!
//! - [`TokenPasteLoginFlow`] — read a token from stdin into the keyring.
//!   Always available on every CLI via `auth login --with-token`,
//!   regardless of whether an OAuth flow is declared (ADR-0007).
//! - `DeviceCodeLoginFlow` — RFC 8628 device-code grant. **TB3, in
//!   [`crate::auth::oauth2`].**
//! - `PkceLoginFlow` — authorization-code + PKCE with a loopback
//!   listener. **TB4, in [`crate::auth::oauth2`].**
//!
//! The `auth` subcommand is always grafted into every CliApp at run
//! time (ADR-0007 § "always-graft"). It exposes:
//!
//! ```text
//! <bin> auth login              # run the declared flow
//! <bin> auth login --with-token # paste a token (universal escape hatch)
//! <bin> auth logout             # clear keyring entry
//! <bin> auth status             # show every credential source per scheme,
//!                               # marking shadowing
//! ```

use std::io::{IsTerminal, Write};
use std::sync::Arc;

use clap::{Arg, ArgAction, ArgMatches, Command};

use crate::auth::builder::SchemeBinding;
use crate::auth::credential::{AuthCredentialSource, CredentialSlots};
use crate::auth::keyring_store::active_store;
use crate::error::CliError;

// ---------------------------------------------------------------------------
// Color helpers — used by `auth status` and the login-flow progress lines.
// ---------------------------------------------------------------------------
//
// Rules:
//   - Color only when stderr is a TTY (status writes there; piped output
//     stays plain).
//   - Honor the `NO_COLOR` convention (https://no-color.org).
//   - `--json` output never gets colored (separate code path).
//
// Codes:
//   bold=1, dim=2, red=31, green=32, yellow=33, bright-black/grey=90, reset=0
fn use_colors() -> bool {
    if std::env::var_os("NO_COLOR").is_some_and(|v| !v.is_empty()) {
        return false;
    }
    std::io::stderr().is_terminal()
}

pub(crate) fn paint(s: &str, code: &str) -> String {
    if use_colors() {
        format!("\x1b[{code}m{s}\x1b[0m")
    } else {
        s.to_string()
    }
}

/// Bold for scheme headers.
pub(crate) fn bold(s: &str) -> String {
    paint(s, "1")
}

/// Green for "active source" + flow-success checkmarks.
pub(crate) fn green(s: &str) -> String {
    paint(s, "32")
}

/// Dim (grey) for shadowed and missing sources — keeps them visible but
/// pushes them visually behind the active source.
pub(crate) fn dim(s: &str) -> String {
    paint(s, "2")
}

/// Yellow for warnings ("env var shadows keyring", "session expired").
pub(crate) fn yellow(s: &str) -> String {
    paint(s, "33")
}

// ---------------------------------------------------------------------------
// LoginFlow trait
// ---------------------------------------------------------------------------

/// Per-binding declaration of how `<bin> auth login` acquires credentials.
///
/// Each CLI declares **exactly one** flow per scheme (ADR-0007 § one-shot).
/// `--with-token` is a runtime escape hatch on every flow, not a separate
/// declaration.
pub trait LoginFlow: Send + Sync + std::fmt::Debug {
    /// Diagnostic flow-type name ("device-code", "pkce", "token-paste").
    fn flow_type(&self) -> &'static str;
    /// Auth scheme name this flow populates — matches the scheme key in
    /// the spec's `components.securitySchemes`.
    fn scheme_name(&self) -> &str;
    /// Execute the flow. On success, the resulting credential lives in
    /// the active keyring at `(cli_name, scheme_name)`. Implementations
    /// should print human-readable progress to stderr.
    fn run(&self, ctx: &LoginContext) -> Result<(), CliError>;
    /// Optional hint URL surfaced to the user during `--with-token`
    /// (where to grab a token from). All flows can carry this — for
    /// PKCE / device-code it's the dashboard URL the user would use if
    /// they bypassed the OAuth dance.
    fn token_paste_url(&self) -> Option<&str> {
        None
    }
    /// Optional request-time auth provider the flow needs registered.
    ///
    /// `TokenPasteLoginFlow` returns `None` — the paste path stores a
    /// raw string in the keyring and the existing typed builders'
    /// keyring source picks it up via the standard chain.
    ///
    /// `DeviceCodeLoginFlow` / `PkceLoginFlow` return
    /// `Some(OAuth2KeyringProvider)` — refresh + Bearer-header logic
    /// can't live in the credential-source layer because it requires
    /// async I/O and access to the flow's `token_url` and `client_id`.
    fn build_auth_provider(
        &self,
        _cli_name: &str,
    ) -> Option<crate::auth::provider::DynAuthProvider> {
        None
    }
}

/// Runtime context for executing a login flow.
#[derive(Debug, Clone)]
pub struct LoginContext {
    pub cli_name: String,
    /// `--no-browser` flag — relevant for PKCE / device-code.
    pub no_browser: bool,
}

/// Boxed login-flow handle stored on `CliApp`.
pub type DynLoginFlow = Arc<dyn LoginFlow>;

// ---------------------------------------------------------------------------
// TokenPasteLoginFlow
// ---------------------------------------------------------------------------

/// Read a token from stdin and stash it in the keyring. The universal
/// "paste a token" path — works for OAuth bearer tokens, raw API keys,
/// anything that's a single opaque string.
///
/// This is the *declared* flow when a binary has no OAuth. It's also
/// the *escape hatch* (`auth login --with-token`) on every other binary,
/// regardless of declared flow.
#[derive(Debug, Clone)]
pub struct TokenPasteLoginFlow {
    scheme: String,
    /// Optional hint URL — where the user can find a token to paste.
    /// Surfaces in the prompt printed before stdin is read.
    /// Derived from `x-fern-cli-auth.token_paste_url` upstream, or set
    /// directly via [`Self::token_paste_url`].
    token_paste_url: Option<String>,
}

impl TokenPasteLoginFlow {
    pub fn new(scheme: impl Into<String>) -> Self {
        Self {
            scheme: scheme.into(),
            token_paste_url: None,
        }
    }

    pub fn token_paste_url(mut self, url: impl Into<String>) -> Self {
        self.token_paste_url = Some(url.into());
        self
    }
}

impl LoginFlow for TokenPasteLoginFlow {
    fn flow_type(&self) -> &'static str {
        "token-paste"
    }
    fn scheme_name(&self) -> &str {
        &self.scheme
    }
    fn run(&self, ctx: &LoginContext) -> Result<(), CliError> {
        run_token_paste(&ctx.cli_name, &self.scheme, self.token_paste_url.as_deref())
    }
    fn token_paste_url(&self) -> Option<&str> {
        self.token_paste_url.as_deref()
    }
}

/// The field names `auth login --with-token` must collect for `scheme_name`,
/// or `None` when it takes a single opaque value.
///
/// Two sources: `SchemeBinding::Basic` always takes username + password, and
/// a `Custom` provider declares its own via
/// [`AuthProvider::credential_fields`] — OAuth2 client credentials returns
/// client id + secret. Both are stored as one JSON keyring entry.
pub(crate) fn scheme_credential_fields(
    scheme_name: &str,
    auth_bindings: &[(String, SchemeBinding)],
) -> Option<Vec<&'static str>> {
    let (_, binding) = auth_bindings.iter().find(|(name, _)| name == scheme_name)?;
    match binding {
        SchemeBinding::Basic { .. } => Some(vec!["username", "password"]),
        SchemeBinding::Custom(provider) => provider.credential_fields(),
        SchemeBinding::Token(_) => None,
    }
}

/// The value stored in a multi-field scheme's keyring entry: every half in
/// one JSON object, read back field-by-field by
/// [`AuthCredentialSource::KeyringField`] (basic) or the provider's own
/// lookup (OAuth2).
pub(crate) fn multi_field_keyring_value(
    fields: &[(&str, String)],
) -> Result<String, CliError> {
    let map: serde_json::Map<String, serde_json::Value> = fields
        .iter()
        .map(|(k, v)| ((*k).to_string(), serde_json::Value::String(v.clone())))
        .collect();
    serde_json::to_string(&serde_json::Value::Object(map))
        .map_err(|e| CliError::Auth(format!("serialise credential: {e}")))
}

/// Read every field a multi-value scheme needs, one stdin line each.
///
/// Pipeable (`printf 'id\nsecret\n' | cli auth login --with-token`), the
/// same contract single-value paste already has. Prompts go to stderr so
/// piping stdout is unaffected, and each is on its own line so a piped run
/// does not render them run together.
pub(crate) fn read_fields_from_stdin(
    fields: &[&'static str],
) -> Result<Vec<(&'static str, String)>, CliError> {
    let stderr = std::io::stderr();
    let mut err = stderr.lock();
    let _ = writeln!(
        err,
        "This scheme needs {} values: {}.",
        fields.len(),
        fields.join(", "),
    );
    let mut out = Vec::with_capacity(fields.len());
    for field in fields {
        let _ = writeln!(err, "{field}:");
        let _ = err.flush();
        out.push((*field, read_line_from_stdin(field)?));
    }
    Ok(out)
}

/// Concrete token-paste implementation, separated so the universal
/// `--with-token` escape hatch (TB2) can reuse it without an
/// explicit `TokenPasteLoginFlow` declaration on the binding.
pub fn run_token_paste(
    cli_name: &str,
    scheme_name: &str,
    token_paste_url: Option<&str>,
) -> Result<(), CliError> {
    run_token_paste_for(cli_name, scheme_name, token_paste_url, None, &[])
}

/// [`run_token_paste`], told which fields the scheme takes.
///
/// `Some(fields)` collects each and stores them as one JSON entry — HTTP
/// basic and OAuth2 client credentials; `None` takes one opaque string.
/// Passed in rather than inferred because this function has no access to
/// the bindings.
pub(crate) fn run_token_paste_for(
    cli_name: &str,
    scheme_name: &str,
    token_paste_url: Option<&str>,
    fields: Option<Vec<&'static str>>,
    shadow_env_vars: &[String],
) -> Result<(), CliError> {
    let stderr = std::io::stderr();
    let mut err = stderr.lock();

    if let Some(url) = token_paste_url {
        let _ = writeln!(err, "Get your credential at: {url}");
    }
    let stored = if let Some(fields) = fields {
        drop(err);
        multi_field_keyring_value(&read_fields_from_stdin(&fields)?)?
    } else {
        let _ = writeln!(err, "Paste your token (input will be read from stdin):");
        let _ = err.flush();
        drop(err);
        read_token_from_stdin()?
    };
    let stderr = std::io::stderr();
    let mut err = stderr.lock();
    let account = crate::profiles::keyring_account(scheme_name);
    active_store().set(cli_name, &account, &stored)?;

    let _ = writeln!(
        err,
        "{}",
        green(&format!(
            "✓ Stored credential for {cli_name}:{account} in {}",
            active_store().backend_label()
        ))
    );
    if let Some(profile) = crate::profiles::active_name() {
        let _ = writeln!(err, "  Scoped to profile `{profile}`.");
    }

    warn_if_env_shadows(&mut err, shadow_env_vars);
    Ok(())
}

/// Read a single line from stdin, trimmed. Returns `Auth("No token …")`
/// if empty / EOF.
pub(crate) fn read_token_from_stdin() -> Result<String, CliError> {
    read_line_from_stdin("token")
}

/// Read one trimmed, non-empty line from stdin. `what` names the value in
/// the error so a two-value basic prompt says which half was missing.
fn read_line_from_stdin(what: &str) -> Result<String, CliError> {
    use std::io::BufRead;
    let stdin = std::io::stdin();
    let mut line = String::new();
    stdin
        .lock()
        .read_line(&mut line)
        .map_err(|e| CliError::Auth(format!("Failed to read {what} from stdin: {e}")))?;
    let trimmed = line.trim().to_string();
    if trimmed.is_empty() {
        return Err(CliError::Auth(format!(
            "No {what} provided on stdin. Pipe it in or type it followed by Enter."
        )));
    }
    Ok(trimmed)
}

// ---------------------------------------------------------------------------
// `auth` subcommand assembly + dispatch
// ---------------------------------------------------------------------------

/// Build the `auth` subcommand subtree. Grafted onto every CliApp by
/// [`crate::app::CliApp::run`] regardless of declared flows.
pub fn build_auth_command() -> Command {
    Command::new("auth")
        .about("Manage credentials (login / logout / status)")
        .arg_required_else_help(true)
        .subcommand(
            Command::new("login")
                .about("Authenticate this CLI (runs the declared OAuth flow, or pastes a token)")
                .arg(
                    Arg::new("from-env")
                        .long("from-env")
                        .help(
                            "Capture the credential from this CLI's own environment \
                             variables into the active profile's keyring slot, instead \
                             of reading it from stdin",
                        )
                        .action(clap::ArgAction::SetTrue)
                        .conflicts_with("with-token"),
                )
                .arg(
                    Arg::new("with-token")
                        .long("with-token")
                        .action(ArgAction::SetTrue)
                        .help("Bypass any declared OAuth flow; read a token from stdin into the keyring"),
                )
                .arg(
                    Arg::new("scheme")
                        .long("scheme")
                        .help("Auth scheme name (required when multiple are declared)"),
                )
                .arg(
                    Arg::new("no-browser")
                        .long("no-browser")
                        .action(ArgAction::SetTrue)
                        .help("Don't auto-open a browser (PKCE / device-code flows)"),
                ),
        )
        .subcommand(
            Command::new("logout")
                .about("Remove stored credentials from the keyring")
                .arg(
                    Arg::new("scheme")
                        .long("scheme")
                        .help("Auth scheme name (required when multiple are declared)"),
                ),
        )
        .subcommand(
            Command::new("status")
                .about("Show every credential source for each declared scheme")
                .arg(
                    Arg::new("json")
                        .long("json")
                        .action(ArgAction::SetTrue)
                        .help("Emit machine-readable JSON (for agents)"),
                ),
        )
}

/// Dispatch into the matched `auth` subcommand. Called by `CliApp::run`
/// after argv is parsed.
///
/// `out` is the stdout sink used for machine-readable output (`status --json`).
/// Human-readable progress goes to stderr unconditionally.
///
/// Returns `Ok(())` on success and exits zero; `Err(CliError)` surfaces
/// the standard JSON error and exits non-zero.
pub fn dispatch_auth<W: Write>(
    matches: &ArgMatches,
    cli_name: &str,
    auth_bindings: &[(String, SchemeBinding)],
    login_flows: &[DynLoginFlow],
    out: &mut W,
) -> Result<(), CliError> {
    match matches.subcommand() {
        Some(("login", m)) => handle_login(m, cli_name, auth_bindings, login_flows),
        Some(("logout", m)) => handle_logout(m, cli_name, auth_bindings),
        Some(("status", m)) => handle_status(m, cli_name, auth_bindings, login_flows, out),
        _ => Err(CliError::Validation(
            "auth requires a subcommand: login, logout, or status".to_string(),
        )),
    }
}

fn handle_login(
    matches: &ArgMatches,
    cli_name: &str,
    auth_bindings: &[(String, SchemeBinding)],
    login_flows: &[DynLoginFlow],
) -> Result<(), CliError> {
    let with_token = matches.get_flag("with-token");
    let no_browser = matches.get_flag("no-browser");

    // `--with-token` is the universal escape hatch (ADR-0007 §
    // "always-graft"): every Fern CLI accepts a pasted token, regardless
    // of whether `auth(...)` / `login_flow(...)` registered any schemes.
    // When nothing is registered, the user must name the keyring slot
    // explicitly via `--scheme`; otherwise resolve_scheme's normal rules
    // (single-binding / single-flow / disambiguation) apply.
    let scheme = if with_token && auth_bindings.is_empty() && login_flows.is_empty() {
        matches
            .get_one::<String>("scheme")
            .cloned()
            .ok_or_else(|| {
                CliError::Validation(
                    "This CLI declares no auth schemes. Pass `--scheme <name>` to choose \
                     the keyring slot for your token.".to_string(),
                )
            })?
    } else {
        resolve_scheme_for(matches.get_one::<String>("scheme"), auth_bindings, login_flows)?
    };

    // `--from-env` exists here and not only on `profiles create` because
    // "capture what is already in my shell into the profile I am on" is a
    // login, and routing it through `profiles create <name> --from-env --force`
    // made users name a profile they had already selected.
    if matches.get_flag("from-env") {
        return run_env_capture(cli_name, &scheme, auth_bindings);
    }

    if with_token {
        // Universal paste path — surfaces the token_paste_url hint from
        // any declared flow for this scheme (regardless of flow type),
        // since the dashboard URL is meaningful for paste no matter which
        // OAuth grant the binary declares.
        let hint: Option<String> = login_flows
            .iter()
            .find(|f| f.scheme_name() == scheme)
            .and_then(|f| f.token_paste_url().map(str::to_string));
        return run_token_paste_for(
            cli_name,
            &scheme,
            hint.as_deref(),
            scheme_credential_fields(&scheme, auth_bindings),
            &shadowing_env_vars(cli_name, &scheme, auth_bindings),
        );
    }

    // Run the declared flow for this scheme.
    let flow = login_flows.iter().find(|f| f.scheme_name() == scheme);
    match flow {
        Some(f) => {
            let ctx = LoginContext {
                cli_name: cli_name.to_string(),
                no_browser,
            };
            f.run(&ctx)?;
            warn_if_env_shadows(
                &mut std::io::stderr().lock(),
                &shadowing_env_vars(cli_name, &scheme, auth_bindings),
            );
            Ok(())
        }
        None => Err(CliError::Validation(format!(
            "No login flow declared for scheme `{scheme}`. Use `auth login --with-token` to paste a token directly."
        ))),
    }
}

fn handle_logout(
    matches: &ArgMatches,
    cli_name: &str,
    auth_bindings: &[(String, SchemeBinding)],
) -> Result<(), CliError> {
    let scheme = resolve_scheme_for(matches.get_one::<String>("scheme"), auth_bindings, &[])?;
    // Logging out under a profile removes *that* profile's credential and
    // leaves the others alone — otherwise `auth logout` while a profile is
    // active would silently log the user out of every tenant.
    let account = crate::profiles::keyring_account(&scheme);
    active_store().delete(cli_name, &account)?;
    let _ = writeln!(
        std::io::stderr().lock(),
        "{}",
        green(&format!(
            "✓ Removed credential for {cli_name}:{account} from {}.",
            active_store().backend_label()
        ))
    );
    Ok(())
}

fn handle_status<W: Write>(
    matches: &ArgMatches,
    cli_name: &str,
    auth_bindings: &[(String, SchemeBinding)],
    login_flows: &[DynLoginFlow],
    out: &mut W,
) -> Result<(), CliError> {
    // `--json` is this subcommand's own boolean and predates the global
    // `--format`. Honouring only that made `auth status --format json` print
    // the human table with no error and no hint — the one command an agent
    // needs before anything else, silently ignoring the flag it was taught to
    // use everywhere else. `--format` (and the piped default behind it) now
    // decides too; `--json` stays as an alias so existing scripts keep working.
    let as_json = matches.get_flag("json")
        || crate::formatter::OutputPipeline::from_matches(matches, cli_name)
            .map(|pipeline| pipeline.format.is_machine_readable())
            .unwrap_or(false);
    let store = active_store();
    let backend = store.backend_label();

    if as_json {
        let entries: Vec<_> = auth_bindings
            .iter()
            .map(|(name, binding)| status_entry_for(cli_name, name, binding, login_flows))
            .collect();
        let payload = serde_json::json!({
            "cli": cli_name,
            "backend": backend,
            // Which tenant's tokens these are. `auth status` is the command an
            // agent runs before anything else; without the profile it answers
            // "am I logged in?" without saying *as whom*.
            "profile": crate::profiles::active_name(),
            "schemes": entries,
        });
        writeln!(out, "{}", serde_json::to_string_pretty(&payload).unwrap())
            .map_err(|e| CliError::Other(e.into()))?;
        return Ok(());
    }

    let mut stderr = std::io::stderr().lock();
    let _ = writeln!(
        stderr,
        "{}: credential status (storage backend: {backend})",
        bold(cli_name)
    );
    if let Some(profile) = crate::profiles::active_name() {
        let _ = writeln!(stderr, "  {}", dim(&format!("profile: {profile}")));
    }
    let _ = writeln!(stderr);

    if auth_bindings.is_empty() {
        let _ = writeln!(stderr, "  No auth schemes are declared on this CLI.");
        return Ok(());
    }

    for (scheme_name, binding) in auth_bindings {
        let flow = login_flows
            .iter()
            .find(|f| f.scheme_name() == scheme_name);

        let _ = writeln!(
            stderr,
            "  {} {}{}",
            bold("Scheme:"),
            bold(scheme_name),
            flow.map(|f| dim(&format!(" (login flow: {})", f.flow_type())))
                .unwrap_or_default()
        );

        let slots = expand_slots(scheme_name, binding, login_flows, cli_name);
        if slots.is_empty() {
            let _ = writeln!(stderr, "    {}", dim("(no credential sources bound)"));
            let _ = writeln!(stderr);
            continue;
        }

        let report = evaluate_slots(&slots);
        for line in &report.lines {
            let painted = match line.state {
                "active" => green(&format!("✓ active    {}", line.description)),
                "shadowed" => dim(&format!("  shadowed  {}", line.description)),
                _ => dim(&format!("  missing   {}", line.description)),
            };
            let _ = writeln!(stderr, "    {painted}");
        }
        if !report.satisfied {
            let _ = writeln!(
                stderr,
                "    {}",
                yellow(&remedy_line(cli_name, scheme_name, &report, login_flows))
            );
        }
        let _ = writeln!(stderr);
    }
    Ok(())
}

/// Resolve which scheme name to operate on. With one binding, infer it;
/// with multiple, require `--scheme`. Used by login + logout.
pub(crate) fn resolve_scheme_for(
    explicit: Option<&String>,
    auth_bindings: &[(String, SchemeBinding)],
    login_flows: &[DynLoginFlow],
) -> Result<String, CliError> {
    if let Some(s) = explicit {
        return Ok(s.clone());
    }
    // Prefer the schemes that have a declared LoginFlow when disambiguating.
    let flow_schemes: Vec<_> = login_flows.iter().map(|f| f.scheme_name()).collect();
    if flow_schemes.len() == 1 {
        return Ok(flow_schemes[0].to_string());
    }
    if auth_bindings.len() == 1 {
        return Ok(auth_bindings[0].0.clone());
    }
    if auth_bindings.is_empty() {
        return Err(CliError::Validation(
            "This CLI does not declare any auth schemes; nothing to log in to.".to_string(),
        ));
    }
    let names: Vec<&str> = auth_bindings.iter().map(|(n, _)| n.as_str()).collect();
    Err(CliError::Validation(format!(
        "Multiple auth schemes declared ({}). Pass --scheme <name> to disambiguate.",
        names.join(", "),
    )))
}

/// Expand a binding into its credential slots, for status reporting. Each
/// required slot is a flat list of leaf sources (Chain flattened) tried in
/// precedence order; a scheme authenticates when every required slot
/// resolves, or when one of the alternatives does (see
/// [`CredentialSlots`]). Bearer/API-key bindings have one slot, basic has
/// two (username, password).
///
/// `SchemeBinding::Custom` bindings report whatever the provider exposes
/// via [`AuthProvider::credential_slots`](crate::auth::AuthProvider::credential_slots)
/// — e.g. `OAuth2TokenProvider` lists its client-id / client-secret env
/// vars, plus a cached access token as an alternative. When the scheme
/// also has a declared login flow (i.e. registered via
/// `CliApp::login_flow`), we synthesize a `Keyring` source for the
/// matching `(cli_name, account)` entry — the OAuth login flows store
/// their token bundle there, and the status surface needs to see it.
/// Without this, OAuth-logged-in users would see "Not logged in" in
/// `auth status` even though the keyring entry is populated and apply()
/// can read it on every request. It lands in `alternatives` because a
/// stored token authenticates by itself.
///
/// `pub(crate)` because [`crate::profiles::commands`] reads the same slots
/// for two things `auth status` does not do: capturing the environment's
/// current credential into a profile (`profiles create --from-env`), and
/// rendering the `[env]` pseudo-row in `profiles list`. Both need the flat
/// leaf-source list, and deriving it twice would let the two drift.
pub(crate) fn expand_slots(
    scheme_name: &str,
    binding: &SchemeBinding,
    login_flows: &[DynLoginFlow],
    cli_name: &str,
) -> CredentialSlots {
    match binding {
        SchemeBinding::Token(s) => CredentialSlots::required([flatten_chain(s.clone())]),
        SchemeBinding::Basic { username, password } => CredentialSlots::required([
            flatten_chain(username.clone()),
            flatten_chain(password.clone()),
        ]),
        SchemeBinding::Custom(provider) => {
            let declared = provider.credential_slots();
            let mut slots = CredentialSlots {
                required: declared
                    .required
                    .into_iter()
                    .map(|slot| slot.into_iter().flat_map(flatten_chain).collect())
                    .filter(|slot: &Vec<AuthCredentialSource>| !slot.is_empty())
                    .collect(),
                alternatives: declared
                    .alternatives
                    .into_iter()
                    .flat_map(flatten_chain)
                    .collect(),
            };
            if login_flows.iter().any(|f| f.scheme_name() == scheme_name) {
                // An alternative, not a required slot: a stored token
                // authenticates on its own, so ANDing it with the
                // provider's acquisition env vars would report a
                // logged-in user as not-logged-in. For a provider that
                // exposes no slots of its own (the generated PKCE /
                // device-code case) this is the only entry, and OR over a
                // single alternative is the same verdict as before.
                //
                // Profile-scoped account: `<scheme>` unprofiled (identical
                // to the pre-profiles entry, so `auth status` keeps seeing
                // an existing login) and `<scheme>#<credential>` under a
                // profile, so the row reports *this* tenant's token rather
                // than whichever one was stored last.
                slots.alternatives.push(AuthCredentialSource::keyring(
                    cli_name,
                    crate::profiles::keyring_account(scheme_name),
                ));
            }
            slots
        }
    }
}

/// One credential source as `auth status` renders it: what it is, and
/// whether it currently supplies a value.
struct SourceState {
    description: String,
    state: &'static str,
}

/// The evaluated state of a scheme's credential slots — one line per
/// source (alternatives first, since they win at request time), plus the
/// facts the remedy line needs.
struct CredentialReport {
    lines: Vec<SourceState>,
    /// Every required slot resolved, or an alternative did.
    satisfied: bool,
    /// Env vars belonging to required slots that failed to resolve, in
    /// declaration order — what the user has to set.
    missing_env_vars: Vec<String>,
    /// A keyring source appears somewhere in the slots, i.e. `auth login
    /// --with-token` would actually be read back at request time.
    reads_keyring: bool,
}

/// Resolve every source once and classify it. Within a slot the first
/// source that resolves is ACTIVE and later ones are SHADOWED — the
/// credential is there but a higher-precedence source is winning.
/// Non-resolving sources are MISSING: declared but unset. Slots don't
/// shadow each other; multi-slot schemes (basic, OAuth client
/// credentials) need every slot to resolve.
fn evaluate_slots(slots: &CredentialSlots) -> CredentialReport {
    let mut lines = Vec::new();
    let mut missing_env_vars = Vec::new();
    let mut reads_keyring = false;
    let mut alternative_active = false;
    let mut all_required_active = !slots.required.is_empty();

    let mut classify = |source: &AuthCredentialSource, active_found: &mut bool| -> bool {
        let has_value = source.resolve().is_some();
        let state = match (has_value, *active_found) {
            (true, false) => {
                *active_found = true;
                "active"
            }
            (true, true) => "shadowed",
            (false, _) => "missing",
        };
        if matches!(source, AuthCredentialSource::Keyring { .. }) {
            reads_keyring = true;
        }
        lines.push(SourceState {
            description: describe_source(source),
            state,
        });
        has_value
    };

    for source in &slots.alternatives {
        classify(source, &mut alternative_active);
    }
    for slot in &slots.required {
        let mut active_found = false;
        for source in slot {
            classify(source, &mut active_found);
        }
        if !active_found {
            missing_env_vars.extend(slot.iter().filter_map(|source| match source {
                AuthCredentialSource::Env(name) => Some(name.clone()),
                _ => None,
            }));
        }
        all_required_active &= active_found;
    }

    CredentialReport {
        lines,
        satisfied: alternative_active || all_required_active,
        missing_env_vars,
        reads_keyring,
    }
}

/// What to tell a user whose scheme didn't resolve. The remedy has to
/// match how the scheme actually reads credentials: `auth login
/// --with-token` writes the keyring, so suggesting it for a scheme that
/// never reads the keyring (OAuth client credentials, basic auth) sends
/// the user down a path that silently does nothing.
fn remedy_line(
    cli_name: &str,
    scheme_name: &str,
    report: &CredentialReport,
    login_flows: &[DynLoginFlow],
) -> String {
    if login_flows.iter().any(|f| f.scheme_name() == scheme_name) {
        format!("Not logged in. Run `{cli_name} auth login` to authenticate.")
    } else if report.reads_keyring {
        format!("Not logged in. Run `{cli_name} auth login --with-token` to authenticate.")
    } else if !report.missing_env_vars.is_empty() {
        format!(
            "Not logged in. Set {} to authenticate.",
            report.missing_env_vars.join(", ")
        )
    } else {
        "Not logged in.".to_string()
    }
}

fn flatten_chain(s: AuthCredentialSource) -> Vec<AuthCredentialSource> {
    match s {
        AuthCredentialSource::Chain(children) => {
            children.into_iter().flat_map(flatten_chain).collect()
        }
        other => vec![other],
    }
}

fn describe_source(s: &AuthCredentialSource) -> String {
    match s {
        AuthCredentialSource::Env(name) => format!("{name} env var"),
        AuthCredentialSource::Cli(arg) => format!("--{arg} flag"),
        AuthCredentialSource::File(path) => format!("{} file", path.display()),
        AuthCredentialSource::Literal(_) => "built-in literal".to_string(),
        AuthCredentialSource::Keyring { service, account } => {
            format!("keyring entry {service}:{account}")
        }
        AuthCredentialSource::KeyringField {
            service,
            account,
            field,
        } => format!("{field} in keyring entry {service}:{account}"),
        AuthCredentialSource::Closure(_, Some(hint)) => hint.clone(),
        AuthCredentialSource::Closure(_, None) => "custom resolver".to_string(),
        AuthCredentialSource::Chain(_) => unreachable!("flatten_chain removes nested Chains"),
        AuthCredentialSource::Missing => "(unbound)".to_string(),
    }
}

/// Print a shadow warning if an env var has a value while a keyring
/// entry is about to be written (or has just been written) — saves
/// the user from the "I logged in but my old env still wins" footgun
/// (ADR-0008 § shadowing).
/// The env vars a scheme actually reads, taken from its declared credential
/// sources rather than guessed from its name.
///
/// Guessing (`<CLI>_<SCHEME>`, `<CLI>_TOKEN`, …) silently misses the common
/// case: Twilio's `account_id_auth_token` scheme reads `TWILIO_ACCOUNT_SID`
/// and `TWILIO_AUTH_TOKEN`, neither of which any name-derived candidate
/// matches — so the shadow warning never fired on the configuration it
/// exists for. Falls back to the guesses only when the scheme is not in the
/// bindings at all, which is the `--with-token --scheme <name>` path on a
/// CLI that declares none.
/// `auth login --from-env`: read the scheme's declared env vars and store the
/// value under the active profile's keyring slot.
///
/// Deliberately the same capture as `profiles create --from-env`, including the
/// shadow warning: `--from-env` *reads* the variable, so without the warning
/// the user is told the capture succeeded and never learns that the variable
/// they captured from keeps winning over the copy they just made.
fn run_env_capture(
    cli_name: &str,
    scheme: &str,
    auth_bindings: &[(String, SchemeBinding)],
) -> Result<(), CliError> {
    let account = crate::profiles::keyring_account(scheme);
    let fields = scheme_credential_fields(scheme, auth_bindings);
    let stored = match fields {
        Some(fields) => {
            let captured = env_multi_credential(auth_bindings, scheme, &fields)
                .ok_or_else(|| from_env_error(cli_name, scheme, &fields.join(" and ")))?;
            multi_field_keyring_value(&captured)?
        }
        None => env_credential(auth_bindings, scheme)
            .ok_or_else(|| from_env_error(cli_name, scheme, "a credential"))?,
    };
    crate::auth::keyring_store::active_store().set(cli_name, &account, &stored)?;

    let mut stderr = std::io::stderr();
    let scope = match crate::profiles::active_name() {
        Some(profile) => format!(" (profile `{profile}`)"),
        None => String::new(),
    };
    let _ = writeln!(
        stderr,
        "{}",
        green(&format!(
            "\u{2713} Stored credential for scheme {scheme}{scope} in {}",
            crate::auth::keyring_store::active_store().backend_label(),
        )),
    );
    warn_if_env_shadows(
        &mut stderr,
        &shadowing_env_vars(cli_name, scheme, auth_bindings),
    );
    Ok(())
}

pub(crate) fn from_env_error(cli_name: &str, scheme: &str, what: &str) -> CliError {
    CliError::Validation(format!(
        "--from-env: no environment variable currently supplies {what} for scheme \
         `{scheme}`. Run `{cli_name} auth status` to see which ones are read."
    ))
}

/// Every field of a multi-value scheme, captured from env vars only.
///
/// `expand_slots` returns one *required* slot per field, in declaration
/// order — username before password, client id before secret — which is
/// what makes the halves separable; a flat source list would not be.
pub(crate) fn env_multi_credential(
    bindings: &[(String, SchemeBinding)],
    scheme: &str,
    fields: &[&'static str],
) -> Option<Vec<(&'static str, String)>> {
    use secrecy::ExposeSecret;
    let binding = bindings.iter().find(|(name, _)| name == scheme)?;
    let slots = expand_slots(scheme, &binding.1, &[], "");
    let mut values = slots.required.into_iter().map(|slot| {
        slot.into_iter()
            .filter(|source| matches!(source, AuthCredentialSource::Env(_)))
            .find_map(|source| source.resolve())
            .map(|secret| secret.expose_secret().to_string())
    });
    let mut out = Vec::with_capacity(fields.len());
    for field in fields {
        out.push((*field, values.next()??));
    }
    Some(out)
}

/// The value an env-var credential source currently supplies for `scheme`.
///
/// Deliberately env-only: `--from-env` captures the environment, so reading
/// through the whole chain would let it capture a *keyring* value and write
/// it back to a different keyring account, which is a confusing no-op at
/// best.
pub(crate) fn env_credential(bindings: &[(String, SchemeBinding)], scheme: &str) -> Option<String> {
    use secrecy::ExposeSecret;
    let binding = bindings.iter().find(|(name, _)| name == scheme)?;
    // No login flows and no cli_name: this reads env vars only, so the
    // synthesized keyring source those arguments would add is irrelevant.
    crate::profiles::commands::credential_sources(scheme, &binding.1, &[], "")
        .into_iter()
        .filter(|source| matches!(source, AuthCredentialSource::Env(_)))
        .find_map(|source| source.resolve())
        .map(|secret| secret.expose_secret().to_string())
}

pub fn shadowing_env_vars(
    cli_name: &str,
    scheme_name: &str,
    auth_bindings: &[(String, SchemeBinding)],
) -> Vec<String> {
    if let Some((_, binding)) = auth_bindings.iter().find(|(name, _)| name == scheme_name) {
        let slots = expand_slots(scheme_name, binding, &[], cli_name);
        let declared: Vec<String> = slots
            .required
            .into_iter()
            .flatten()
            .chain(slots.alternatives)
            .filter_map(|source| match source {
                AuthCredentialSource::Env(name) => Some(name),
                _ => None,
            })
            .collect();
        if !declared.is_empty() {
            return declared;
        }
    }
    let upper_cli = cli_name.to_uppercase().replace('-', "_");
    let upper_scheme = scheme_name.to_uppercase().replace('-', "_");
    vec![
        format!("{upper_cli}_{upper_scheme}"),
        format!("{upper_cli}_TOKEN"),
        format!("{upper_cli}_API_KEY"),
        upper_scheme,
    ]
}

/// Warn when any of `candidates` is set and would outrank the keyring entry
/// just written. Get `candidates` from [`shadowing_env_vars`].
pub(crate) fn warn_if_env_shadows<W: Write>(out: &mut W, candidates: &[String]) {
    for name in candidates {
        if let Ok(v) = std::env::var(name) {
            if !v.trim().is_empty() {
                let _ = writeln!(
                    out,
                    "{}",
                    yellow(&format!(
                        "⚠ Warning: env var `{name}` is set; it will shadow the keyring entry. \
                         Unset it to use the credential you just stored."
                    ))
                );
                return;
            }
        }
    }
}

fn status_entry_for(
    cli_name: &str,
    scheme_name: &str,
    binding: &SchemeBinding,
    login_flows: &[DynLoginFlow],
) -> serde_json::Value {
    let flow = login_flows
        .iter()
        .find(|f| f.scheme_name() == scheme_name)
        .map(|f| f.flow_type());
    let slots = expand_slots(scheme_name, binding, login_flows, cli_name);
    let report = evaluate_slots(&slots);
    let entries: Vec<serde_json::Value> = report
        .lines
        .iter()
        .map(|line| {
            serde_json::json!({
                "state": line.state,
                "source": line.description,
            })
        })
        .collect();
    serde_json::json!({
        "scheme": scheme_name,
        "login_flow": flow,
        "logged_in": report.satisfied,
        "sources": entries,
        "cli": cli_name,
        "profile": crate::profiles::active_name(),
    })
}

/// Inject a keyring source into each binding's credential chain so
/// every CLI's auth resolution gets the keyring layer for free.
///
/// Called by `CliApp::run` before bindings are propagated. Precedence
/// stays CLI > env > keyring > file — keyring is appended last in the
/// existing chain so any explicit user-configured source wins.
pub fn inject_keyring_sources(
    cli_name: &str,
    bindings: &mut [(String, SchemeBinding)],
) {
    for (scheme_name, binding) in bindings.iter_mut() {
        // The account is profile-scoped: `<scheme>` with no profile
        // selected (byte-identical to the pre-profiles key, so an existing
        // keychain entry keeps resolving) and `<scheme>#<credential>` with
        // one. The profile does not add a rung to the credential chain —
        // it only chooses which account this rung reads.
        let kr = AuthCredentialSource::keyring(
            cli_name,
            crate::profiles::keyring_account(scheme_name.as_str()),
        );
        match binding {
            SchemeBinding::Token(src) => {
                let existing = std::mem::replace(src, AuthCredentialSource::Missing);
                *src = splice_keyring(existing, kr);
            }
            // Basic auth's two halves are one logical credential, so they
            // share a single keyring entry holding
            // `{"username": …, "password": …}` and each half reads its own
            // field out of it. One entry rather than two because the OS
            // keychain prompts per item — two would mean two prompts to
            // send one request.
            //
            // Without this, `auth login` on a basic-auth CLI wrote an entry
            // that nothing ever read: the credential appeared to store and
            // the CLI still reported "not logged in".
            SchemeBinding::Basic { username, password } => {
                let account = crate::profiles::keyring_account(scheme_name.as_str());
                for (src, field) in [(username, "username"), (password, "password")] {
                    let existing = std::mem::replace(src, AuthCredentialSource::Missing);
                    *src = splice_keyring(
                        existing,
                        AuthCredentialSource::keyring_field(cli_name, &account, field),
                    );
                }
            }
            SchemeBinding::Custom(_) => {}
        }
    }
}

/// Wire on-disk token caching into every [`OAuth2TokenProvider`] reachable
/// from the bindings. Called after [`inject_keyring_sources`] but before
/// propagation to subcommands.
pub fn inject_oauth2_caches(cli_name: &str, bindings: &mut [(String, SchemeBinding)]) {
    for (_scheme_name, binding) in bindings.iter_mut() {
        if let SchemeBinding::Custom(provider) = binding {
            provider.inject_token_cache(cli_name);
        }
    }
}

/// Splice the profile's keyring rung into a scheme's credential chain at
/// the right precedence.
///
/// Normally it goes *last*, preserving ADR-0008's order (CLI flag > env >
/// keyring > file). But when the profile was named explicitly with `-p`, it
/// goes *first*: `-p prod` is the most specific statement of intent this
/// invocation has, and every other explicit flag already beats the
/// environment. An ambient profile still loses to env, so a CI job's
/// exported credentials stay authoritative. See
/// [`crate::profiles::outranks_env`].
fn splice_keyring(
    existing: AuthCredentialSource,
    keyring: AuthCredentialSource,
) -> AuthCredentialSource {
    if crate::profiles::outranks_env() {
        return match existing {
            AuthCredentialSource::Chain(mut sources) => {
                sources.insert(0, keyring);
                AuthCredentialSource::Chain(sources)
            }
            AuthCredentialSource::Missing => keyring,
            single => AuthCredentialSource::Chain(vec![keyring, single]),
        };
    }
    append_to_chain(existing, keyring)
}

fn append_to_chain(
    existing: AuthCredentialSource,
    addition: AuthCredentialSource,
) -> AuthCredentialSource {
    match existing {
        AuthCredentialSource::Chain(mut sources) => {
            sources.push(addition);
            AuthCredentialSource::Chain(sources)
        }
        AuthCredentialSource::Missing => addition,
        single => AuthCredentialSource::Chain(vec![single, addition]),
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::keyring_store::{set_active_store, KeyringStore, MockKeyringStore};
    use serial_test::serial;

    /// Sets env vars for the duration of a test and restores their prior
    /// values on drop — including when an assertion panics part-way, which
    /// trailing `remove_var` calls do not. Mirrors `TempFileGuard` in
    /// `oauth_common.rs`. Pair with `#[serial]`: this restores state, it
    /// does not serialize access to it.
    struct EnvVarGuard {
        saved: Vec<(String, Option<std::ffi::OsString>)>,
    }

    impl EnvVarGuard {
        fn set<'a>(vars: impl IntoIterator<Item = (&'a str, &'a str)>) -> Self {
            let saved = vars
                .into_iter()
                .map(|(key, value)| {
                    let prior = std::env::var_os(key);
                    std::env::set_var(key, value);
                    (key.to_string(), prior)
                })
                .collect();
            Self { saved }
        }

        /// Unset one of the guarded vars mid-test. The prior value is still
        /// restored on drop.
        fn unset(&self, key: &str) {
            std::env::remove_var(key);
        }
    }

    impl Drop for EnvVarGuard {
        fn drop(&mut self) {
            for (key, prior) in &self.saved {
                match prior {
                    Some(value) => std::env::set_var(key, value),
                    None => std::env::remove_var(key),
                }
            }
        }
    }
    use std::sync::Arc;

    #[test]
    fn token_paste_flow_type_and_scheme() {
        let f = TokenPasteLoginFlow::new("OAuth2");
        assert_eq!(f.flow_type(), "token-paste");
        assert_eq!(f.scheme_name(), "OAuth2");
    }

    #[test]
    fn token_paste_with_url_carries_hint() {
        let f = TokenPasteLoginFlow::new("OAuth2")
            .token_paste_url("https://example.com/settings");
        assert_eq!(f.token_paste_url.as_deref(), Some("https://example.com/settings"));
    }

    /// Run `f` with `profile` installed process-wide, restoring afterwards.
    /// Every caller must be `#[serial]` — the slot is process-global.
    fn with_profile<R>(credential: Option<&str>, f: impl FnOnce() -> R) -> R {
        crate::profiles::install_for_tests(credential.map(|credential| {
            crate::profiles::ResolvedProfile {
                name: credential.to_string(),
                credential: Some(credential.to_string()),
                ..Default::default()
            }
        }));
        let result = f();
        crate::profiles::install_for_tests(None);
        result
    }

    #[test]
    #[serial]
    fn the_keyring_account_is_unchanged_without_a_profile() {
        // The compatibility guarantee: an existing keychain entry keeps
        // resolving after an upgrade, so nobody is logged out.
        with_profile(None, || {
            let mut bindings = vec![(
                "OAuth2".to_string(),
                SchemeBinding::Token(AuthCredentialSource::from_env("MY_TOKEN")),
            )];
            inject_keyring_sources("my-cli", &mut bindings);
            match &bindings[0].1 {
                SchemeBinding::Token(AuthCredentialSource::Chain(sources)) => assert!(
                    matches!(
                        sources[1],
                        AuthCredentialSource::Keyring { ref account, .. } if account == "OAuth2"
                    ),
                    "{:?}",
                    describe_source(&sources[1]),
                ),
                _ => panic!("expected Token(Chain([Env, Keyring]))"),
            }
        });
    }

    #[test]
    #[serial]
    fn the_keyring_account_is_namespaced_under_a_profile() {
        // Two tenants must hold separate credentials for one scheme.
        with_profile(Some("acme"), || {
            let mut bindings = vec![(
                "OAuth2".to_string(),
                SchemeBinding::Token(AuthCredentialSource::from_env("MY_TOKEN")),
            )];
            inject_keyring_sources("my-cli", &mut bindings);
            match &bindings[0].1 {
                SchemeBinding::Token(AuthCredentialSource::Chain(sources)) => assert!(
                    matches!(
                        sources[1],
                        AuthCredentialSource::Keyring { ref account, .. }
                            if account == "OAuth2#acme"
                    ),
                    "{:?}",
                    describe_source(&sources[1]),
                ),
                _ => panic!("expected Token(Chain([Env, Keyring]))"),
            }
        });
    }

    #[test]
    #[serial]
    fn the_profile_does_not_add_a_rung_to_the_credential_chain() {
        // It only selects which account the existing keyring rung reads, so
        // ADR-0008's precedence (CLI > env > keyring > file) is untouched.
        with_profile(Some("acme"), || {
            let mut bindings = vec![(
                "OAuth2".to_string(),
                SchemeBinding::Token(AuthCredentialSource::from_env("MY_TOKEN")),
            )];
            inject_keyring_sources("my-cli", &mut bindings);
            match &bindings[0].1 {
                SchemeBinding::Token(AuthCredentialSource::Chain(sources)) => {
                    assert_eq!(sources.len(), 2, "{sources:?}", sources = sources.len());
                    assert!(matches!(sources[0], AuthCredentialSource::Env(_)));
                }
                _ => panic!("expected Token(Chain([Env, Keyring]))"),
            }
        });
    }

    #[test]
    #[serial]
    fn inject_keyring_into_single_env_source() {
        let mut bindings = vec![(
            "OAuth2".to_string(),
            SchemeBinding::Token(AuthCredentialSource::from_env("MY_TOKEN")),
        )];
        inject_keyring_sources("my-cli", &mut bindings);
        match &bindings[0].1 {
            SchemeBinding::Token(AuthCredentialSource::Chain(sources)) => {
                assert_eq!(sources.len(), 2);
                assert!(matches!(sources[0], AuthCredentialSource::Env(_)));
                assert!(matches!(
                    sources[1],
                    AuthCredentialSource::Keyring { ref service, ref account }
                    if service == "my-cli" && account == "OAuth2"
                ));
            }
            _ => panic!("expected Token(Chain([Env, Keyring]))"),
        }
    }

    #[test]
    #[serial]
    fn inject_keyring_appends_to_existing_chain() {
        let mut bindings = vec![(
            "scheme1".to_string(),
            SchemeBinding::Token(AuthCredentialSource::any([
                AuthCredentialSource::cli("api-token"),
                AuthCredentialSource::from_env("MY_TOKEN"),
            ])),
        )];
        inject_keyring_sources("cli", &mut bindings);
        match &bindings[0].1 {
            SchemeBinding::Token(AuthCredentialSource::Chain(sources)) => {
                assert_eq!(sources.len(), 3);
                assert!(matches!(sources[0], AuthCredentialSource::Cli(_)));
                assert!(matches!(sources[1], AuthCredentialSource::Env(_)));
                assert!(matches!(sources[2], AuthCredentialSource::Keyring { .. }));
            }
            _ => panic!("expected Chain"),
        }
    }

    #[test]
    #[serial]
    fn inject_keyring_promotes_missing_to_keyring_alone() {
        let mut bindings = vec![(
            "scheme1".to_string(),
            SchemeBinding::Token(AuthCredentialSource::Missing),
        )];
        inject_keyring_sources("cli", &mut bindings);
        match &bindings[0].1 {
            SchemeBinding::Token(AuthCredentialSource::Keyring { service, account }) => {
                assert_eq!(service, "cli");
                assert_eq!(account, "scheme1");
            }
            _ => panic!("expected single Keyring source"),
        }
    }

    #[test]
    fn resolve_scheme_single_binding_no_arg() {
        let bindings = vec![(
            "only".to_string(),
            SchemeBinding::Token(AuthCredentialSource::Missing),
        )];
        let s = resolve_scheme_for(None, &bindings, &[]).unwrap();
        assert_eq!(s, "only");
    }

    #[test]
    fn resolve_scheme_explicit_wins() {
        let bindings = vec![
            ("a".to_string(), SchemeBinding::Token(AuthCredentialSource::Missing)),
            ("b".to_string(), SchemeBinding::Token(AuthCredentialSource::Missing)),
        ];
        let s = resolve_scheme_for(Some(&"b".to_string()), &bindings, &[]).unwrap();
        assert_eq!(s, "b");
    }

    #[test]
    fn resolve_scheme_multiple_bindings_no_arg_errors() {
        let bindings = vec![
            ("a".to_string(), SchemeBinding::Token(AuthCredentialSource::Missing)),
            ("b".to_string(), SchemeBinding::Token(AuthCredentialSource::Missing)),
        ];
        let err = resolve_scheme_for(None, &bindings, &[]).unwrap_err();
        match err {
            CliError::Validation(m) => {
                assert!(m.contains("--scheme"));
                assert!(m.contains("a"));
                assert!(m.contains("b"));
            }
            _ => panic!("expected Validation error"),
        }
    }

    #[test]
    fn resolve_scheme_disambiguates_via_single_login_flow() {
        // Multiple bindings, but only one has a declared login flow → use it.
        let bindings = vec![
            ("a".to_string(), SchemeBinding::Token(AuthCredentialSource::Missing)),
            ("b".to_string(), SchemeBinding::Token(AuthCredentialSource::Missing)),
        ];
        let flows: Vec<DynLoginFlow> = vec![Arc::new(TokenPasteLoginFlow::new("b"))];
        let s = resolve_scheme_for(None, &bindings, &flows).unwrap();
        assert_eq!(s, "b");
    }

    #[test]
    #[serial]
    fn paint_is_a_noop_when_colors_are_disabled() {
        // `paint` must emit no ANSI codes when colors are off. Force the
        // no-color path explicitly via `NO_COLOR` rather than relying on
        // stderr not being a TTY: `cargo test` captures each test's stdout
        // but leaves stderr attached to the terminal, so in an interactive
        // shell `stderr().is_terminal()` is true and `use_colors()` would
        // flip on — making this test's outcome depend on how the suite was
        // launched. `#[serial]` keeps the process-global env mutation from
        // racing the other env-touching tests in this module.
        let prev = std::env::var_os("NO_COLOR");
        std::env::set_var("NO_COLOR", "1");

        assert_eq!(green("ok"), "ok");
        assert!(!dim("shadow").contains('\x1b'));
        assert!(!yellow("warn").contains('\x1b'));
        assert!(!bold("hdr").contains('\x1b'));

        match prev {
            Some(value) => std::env::set_var("NO_COLOR", value),
            None => std::env::remove_var("NO_COLOR"),
        }
    }

    #[test]
    #[serial]
    fn with_token_resolves_scheme_from_explicit_arg_when_bindingless() {
        // ADR-0007 § always-graft: ElevenLabs (no auth_bindings, no
        // login_flows) must still accept `auth login --with-token`. With
        // --scheme passed, resolution picks it up from the flag instead
        // of bailing on the empty bindings list. (The full handle_login
        // path that reads stdin is exercised by tests/oauth_fixture_wire.rs.)
        let cmd = build_auth_command();
        let m = cmd
            .try_get_matches_from(vec![
                "auth", "login", "--with-token", "--scheme", "api-key",
            ])
            .unwrap();
        let (_, sub) = m.subcommand().unwrap();
        assert!(sub.get_flag("with-token"));
        assert_eq!(sub.get_one::<String>("scheme").map(String::as_str), Some("api-key"));
    }

    #[test]
    #[serial]
    fn with_token_errors_on_bindingless_cli_without_explicit_scheme() {
        // Same setup but no --scheme. handle_login should produce a
        // Validation error pointing the user at --scheme — instead of
        // the old "no auth schemes; nothing to log in to" error that
        // violated ADR-0007's "works on every CLI" promise.
        use crate::auth::keyring_store::{set_active_store, MockKeyringStore};
        set_active_store(Arc::new(MockKeyringStore::new()));

        let cmd = build_auth_command();
        let m = cmd
            .try_get_matches_from(vec!["auth", "login", "--with-token"])
            .unwrap();
        let (_, sub) = m.subcommand().unwrap();

        let bindings: Vec<(String, SchemeBinding)> = vec![];
        let flows: Vec<DynLoginFlow> = vec![];
        match handle_login(sub, "my-cli", &bindings, &flows) {
            Err(CliError::Validation(msg)) => {
                assert!(
                    msg.contains("declares no auth schemes") && msg.contains("--scheme"),
                    "expected 'declares no auth schemes ... --scheme' message, got: {msg}"
                );
            }
            other => panic!("expected Validation error, got: {other:?}"),
        }
    }

    #[test]
    #[serial]
    fn expand_slots_synthesises_keyring_for_oauth_custom_binding() {
        use crate::auth::provider::NoAuthProvider;
        // OAuth flows register their auth provider as Custom; expand_slots
        // must still surface the keyring slot for `auth status`.
        let binding = SchemeBinding::Custom(std::sync::Arc::new(NoAuthProvider));
        // Use a TokenPasteLoginFlow as a stand-in for any LoginFlow declared
        // against scheme "OAuth2" — the only thing expand_slots reads is
        // scheme_name().
        let flow: DynLoginFlow = std::sync::Arc::new(TokenPasteLoginFlow::new("OAuth2"));
        let slots = expand_slots("OAuth2", &binding, &[flow], "my-cli");
        // The stored token authenticates on its own, so it is an
        // alternative rather than a required slot.
        assert!(slots.required.is_empty());
        assert_eq!(slots.alternatives.len(), 1);
        match &slots.alternatives[0] {
            AuthCredentialSource::Keyring { service, account } => {
                assert_eq!(service, "my-cli");
                assert_eq!(account, "OAuth2");
            }
            other => panic!("expected synthesised Keyring source, got {other:?}"),
        }
    }

    #[test]
    fn expand_slots_returns_empty_for_custom_with_no_login_flow() {
        use crate::auth::provider::NoAuthProvider;
        // Custom bindings whose provider exposes no credential slots and
        // have no matching login_flow stay opaque — status output shows
        // "(no credential sources bound)".
        let binding = SchemeBinding::Custom(std::sync::Arc::new(NoAuthProvider));
        let slots = expand_slots("OAuth2", &binding, &[], "my-cli");
        assert!(slots.is_empty());
    }

    #[test]
    fn expand_slots_lists_oauth2_client_credentials_env_vars() {
        use crate::auth::root_builder::{AuthSchemeBuilder, OAuth2Auth};
        // A generated client-credentials scheme lowers to a Custom binding
        // wrapping OAuth2TokenProvider. `auth status` must enumerate its
        // client-id / client-secret env vars as two independent slots rather
        // than reporting "(no credential sources bound)".
        let (name, binding) = OAuth2Auth::new("oAuth2ClientCredentials")
            .token_url("https://example.com/oauth/token")
            .client_id_env("OAUTH_CLIENT_ID")
            .client_secret_env("OAUTH_CLIENT_SECRET")
            .into_binding();
        let slots = expand_slots(&name, &binding, &[], "my-cli");
        assert_eq!(slots.required.len(), 2);
        assert!(
            matches!(&slots.required[0][..], [AuthCredentialSource::Env(e)] if e == "OAUTH_CLIENT_ID")
        );
        assert!(
            matches!(&slots.required[1][..], [AuthCredentialSource::Env(e)] if e == "OAUTH_CLIENT_SECRET")
        );
    }


    #[test]
    #[serial]
    fn status_reports_oauth2_client_credentials_env_vars() {
        use crate::auth::root_builder::{AuthSchemeBuilder, OAuth2Auth};
        let env = EnvVarGuard::set([
            ("STATUS_TEST_OAUTH_CLIENT_ID", "id"),
            ("STATUS_TEST_OAUTH_CLIENT_SECRET", "secret"),
        ]);
        let (name, binding) = OAuth2Auth::new("oAuth2ClientCredentials")
            .token_url("https://example.com/oauth/token")
            .client_id_env("STATUS_TEST_OAUTH_CLIENT_ID")
            .client_secret_env("STATUS_TEST_OAUTH_CLIENT_SECRET")
            .into_binding();

        let entry = status_entry_for("my-cli", &name, &binding, &[]);
        assert_eq!(entry["logged_in"], true);
        let states: Vec<&str> = entry["sources"]
            .as_array()
            .unwrap()
            .iter()
            .map(|s| s["state"].as_str().unwrap())
            .collect();
        assert_eq!(states, ["active", "active"]);

        env.unset("STATUS_TEST_OAUTH_CLIENT_SECRET");
        let entry = status_entry_for("my-cli", &name, &binding, &[]);
        assert_eq!(entry["logged_in"], false);
        // `env` restores both vars on drop, panic or not.
    }

    #[test]
    fn alternative_satisfies_scheme_without_hiding_required_env_vars() {
        // A cached OAuth token authenticates on its own, but the env vars
        // that mint it must still show up: the whole point of `auth status`
        // for a client-credentials scheme is answering "did you read my
        // OAUTH_CLIENT_ID?".
        let slots = CredentialSlots {
            required: vec![
                vec![AuthCredentialSource::from_env("NO_SUCH_ALT_TEST_ID")],
                vec![AuthCredentialSource::from_env("NO_SUCH_ALT_TEST_SECRET")],
            ],
            alternatives: vec![AuthCredentialSource::Closure(
                std::sync::Arc::new(|| Some("cached-tok".to_string())),
                Some("cached OAuth token (/tmp/credentials.json)".to_string()),
            )],
        };

        let report = evaluate_slots(&slots);
        assert!(report.satisfied);
        let rendered: Vec<(&str, &str)> = report
            .lines
            .iter()
            .map(|l| (l.state, l.description.as_str()))
            .collect();
        assert_eq!(
            rendered,
            vec![
                ("active", "cached OAuth token (/tmp/credentials.json)"),
                ("missing", "NO_SUCH_ALT_TEST_ID env var"),
                ("missing", "NO_SUCH_ALT_TEST_SECRET env var"),
            ]
        );
        assert_eq!(
            report.missing_env_vars,
            vec!["NO_SUCH_ALT_TEST_ID", "NO_SUCH_ALT_TEST_SECRET"]
        );
    }

    #[test]
    fn remedy_names_missing_env_vars_when_the_scheme_never_reads_the_keyring() {
        // `auth login --with-token` writes the keyring; OAuth client
        // credentials never read it, so suggesting it would send the user
        // down a path that silently does nothing.
        let slots = CredentialSlots::required([
            vec![AuthCredentialSource::from_env("NO_SUCH_REMEDY_ID")],
            vec![AuthCredentialSource::from_env("NO_SUCH_REMEDY_SECRET")],
        ]);
        let report = evaluate_slots(&slots);
        assert!(!report.satisfied);
        assert!(!report.reads_keyring);

        let line = remedy_line("my-cli", "oAuth2ClientCredentials", &report, &[]);
        assert_eq!(
            line,
            "Not logged in. Set NO_SUCH_REMEDY_ID, NO_SUCH_REMEDY_SECRET to authenticate."
        );
    }

    #[test]
    #[serial]
    fn remedy_suggests_with_token_when_the_scheme_reads_the_keyring() {
        // Token bindings get a keyring source injected, so `--with-token`
        // really is the fix there.
        set_active_store(Arc::new(MockKeyringStore::new()));
        let slots = CredentialSlots::required([vec![
            AuthCredentialSource::from_env("NO_SUCH_REMEDY_TOKEN"),
            AuthCredentialSource::keyring("my-cli", "OAuth2"),
        ]]);
        let report = evaluate_slots(&slots);
        assert!(!report.satisfied);
        assert!(report.reads_keyring);
        assert_eq!(
            remedy_line("my-cli", "OAuth2", &report, &[]),
            "Not logged in. Run `my-cli auth login --with-token` to authenticate."
        );
    }

    #[test]
    fn remedy_points_at_the_login_flow_when_one_is_declared() {
        let slots = CredentialSlots::required([vec![AuthCredentialSource::from_env(
            "NO_SUCH_REMEDY_FLOW",
        )]]);
        let report = evaluate_slots(&slots);
        let flow: DynLoginFlow = std::sync::Arc::new(TokenPasteLoginFlow::new("OAuth2"));
        assert_eq!(
            remedy_line("my-cli", "OAuth2", &report, &[flow]),
            "Not logged in. Run `my-cli auth login` to authenticate."
        );
    }

    #[test]
    fn keyring_alternative_does_not_and_with_provider_env_slots() {
        // A scheme wiring both `.auth(OAuth2Auth…)` and a paste login flow
        // ends up with provider env slots *and* a keyring entry. ANDing
        // them would report a user who pasted a token as not-logged-in
        // just because the client-id env var is unset.
        use crate::auth::root_builder::{AuthSchemeBuilder, OAuth2Auth};
        let (name, binding) = OAuth2Auth::new("OAuth2")
            .token_url("https://example.com/oauth/token")
            .client_id_env("NO_SUCH_KEYRING_ALT_ID")
            .client_secret_env("NO_SUCH_KEYRING_ALT_SECRET")
            .into_binding();
        let flow: DynLoginFlow = std::sync::Arc::new(TokenPasteLoginFlow::new(&name));
        let slots = expand_slots(&name, &binding, &[flow], "my-cli");

        assert_eq!(slots.required.len(), 2);
        assert_eq!(slots.alternatives.len(), 1);
        assert!(matches!(
            slots.alternatives[0],
            AuthCredentialSource::Keyring { .. }
        ));
    }

    #[test]
    #[serial]
    fn keyring_alternative_alone_satisfies_the_scheme() {
        use crate::auth::root_builder::{AuthSchemeBuilder, OAuth2Auth};
        let mock = Arc::new(MockKeyringStore::new());
        mock.set("my-cli", "OAuth2", "pasted-token").unwrap();
        set_active_store(mock);
        let (name, binding) = OAuth2Auth::new("OAuth2")
            .token_url("https://example.com/oauth/token")
            .client_id_env("NO_SUCH_KEYRING_SAT_ID")
            .client_secret_env("NO_SUCH_KEYRING_SAT_SECRET")
            .into_binding();
        let flow: DynLoginFlow = std::sync::Arc::new(TokenPasteLoginFlow::new(&name));

        let report = evaluate_slots(&expand_slots(&name, &binding, &[flow], "my-cli"));
        assert!(report.satisfied, "keyring token alone must authenticate");
        assert!(report.reads_keyring);
        // Env slots stay visible even though the token satisfies the scheme.
        assert_eq!(
            report.lines.iter().filter(|l| l.state == "missing").count(),
            2
        );
    }

    #[test]
    fn blank_env_var_name_reports_unbound_not_an_empty_env_var() {
        // `client-id-env: ""` reaches the generated builder verbatim. The
        // slot must survive (so `logged_in` stays false, matching
        // `has_credentials`) without rendering `missing    env var` or a
        // remedy reading `Set , OTHER_VAR`.
        use crate::auth::root_builder::{AuthSchemeBuilder, OAuth2Auth};
        let (name, binding) = OAuth2Auth::new("OAuth2")
            .token_url("https://example.com/oauth/token")
            .client_id_env("")
            .client_secret_env("NO_SUCH_BLANK_TEST_SECRET")
            .into_binding();
        let slots = expand_slots(&name, &binding, &[], "my-cli");
        assert_eq!(slots.required.len(), 2, "the unbound slot must not vanish");
        assert!(matches!(
            &slots.required[0][..],
            [AuthCredentialSource::Missing]
        ));

        let report = evaluate_slots(&slots);
        assert!(!report.satisfied);
        assert_eq!(report.lines[0].description, "(unbound)");
        assert_eq!(
            report.missing_env_vars,
            vec!["NO_SUCH_BLANK_TEST_SECRET"],
            "a blank name must not become an empty item in the remedy"
        );
        assert_eq!(
            remedy_line("my-cli", &name, &report, &[]),
            "Not logged in. Set NO_SUCH_BLANK_TEST_SECRET to authenticate."
        );
    }

    #[test]
    fn expand_slots_keeps_basic_halves_in_separate_slots() {
        // Username and password are both required; the password must not be
        // reported as "shadowed" by the username.
        let binding = SchemeBinding::Basic {
            username: AuthCredentialSource::from_env("USER"),
            password: AuthCredentialSource::from_env("PASS"),
        };
        let slots = expand_slots("basic", &binding, &[], "my-cli");
        assert_eq!(slots.required.len(), 2);
        assert!(matches!(&slots.required[0][..], [AuthCredentialSource::Env(e)] if e == "USER"));
        assert!(matches!(&slots.required[1][..], [AuthCredentialSource::Env(e)] if e == "PASS"));
    }

    #[test]
    fn flatten_chain_handles_nested_chains() {
        let s = AuthCredentialSource::any([
            AuthCredentialSource::from_env("A"),
            AuthCredentialSource::any([
                AuthCredentialSource::from_env("B"),
                AuthCredentialSource::literal("c"),
            ]),
        ]);
        let flat = flatten_chain(s);
        assert_eq!(flat.len(), 3);
    }

    #[test]
    fn describe_source_covers_all_variants() {
        assert_eq!(
            describe_source(&AuthCredentialSource::from_env("FOO")),
            "FOO env var"
        );
        assert_eq!(
            describe_source(&AuthCredentialSource::cli("api-token")),
            "--api-token flag"
        );
        assert!(describe_source(&AuthCredentialSource::keyring("cli", "scheme"))
            .contains("cli:scheme"));
    }

    #[test]
    #[serial]
    fn logout_clears_keyring_entry() {
        let mock = Arc::new(MockKeyringStore::new());
        mock.set("my-cli", "OAuth2", "token-abc").unwrap();
        set_active_store(mock.clone());

        let cmd = build_auth_command();
        let m = cmd
            .try_get_matches_from(vec!["auth", "logout", "--scheme", "OAuth2"])
            .unwrap();
        let bindings = vec![(
            "OAuth2".to_string(),
            SchemeBinding::Token(AuthCredentialSource::Missing),
        )];
        let (_, sub) = m.subcommand().unwrap();
        handle_logout(sub, "my-cli", &bindings).unwrap();
        let _ = handle_logout; // silence unused warning if other paths shift

        assert_eq!(mock.get("my-cli", "OAuth2").unwrap(), None);
    }

    #[test]
    #[serial]
    fn status_marks_env_as_active_keyring_as_shadowed() {
        let mock = Arc::new(MockKeyringStore::new());
        mock.set("my-cli", "OAuth2", "from-keyring").unwrap();
        set_active_store(mock);
        std::env::set_var("MY_CLI_OAUTH2_TEST", "from-env");

        let chain = AuthCredentialSource::any([
            AuthCredentialSource::from_env("MY_CLI_OAUTH2_TEST"),
            AuthCredentialSource::keyring("my-cli", "OAuth2"),
        ]);
        let slots = expand_slots("OAuth2", &SchemeBinding::Token(chain), &[], "my-cli");
        assert_eq!(slots.required.len(), 1);
        let sources = &slots.required[0];
        assert_eq!(sources.len(), 2);
        let env_resolves = sources[0].resolve().is_some();
        let keyring_resolves = sources[1].resolve().is_some();
        assert!(env_resolves);
        assert!(keyring_resolves);
        // (Status output assertion happens in handle_status, but the
        // underlying state — both resolve, env is first — is what makes
        // shadowing detectable. Direct test of handler is harder because
        // it writes to stderr.)

        std::env::remove_var("MY_CLI_OAUTH2_TEST");
    }

    #[test]
    fn inject_oauth2_caches_wires_cache_into_custom_provider() {
        use crate::auth::oauth2::{OAuth2Grant, OAuth2TokenProvider};

        let provider = Arc::new(OAuth2TokenProvider::new(
            "OAuth2",
            "https://example.com/token",
            OAuth2Grant::ClientCredentials {
                client_id_env: "CID".to_string(),
                client_secret_env: "CSEC".to_string(),
                scope: None,
            },
        ));
        assert!(!provider.has_cache());

        let mut bindings: Vec<(String, SchemeBinding)> = vec![(
            "OAuth2".to_string(),
            SchemeBinding::Custom(provider.clone()),
        )];
        inject_oauth2_caches("test-cli", &mut bindings);
        assert!(provider.has_cache());
    }

    #[test]
    fn inject_oauth2_caches_is_noop_for_token_bindings() {
        let mut bindings: Vec<(String, SchemeBinding)> = vec![(
            "bearer".to_string(),
            SchemeBinding::Token(AuthCredentialSource::from_env("MY_TOKEN")),
        )];
        // Should not panic or modify Token bindings
        inject_oauth2_caches("test-cli", &mut bindings);
        assert!(matches!(bindings[0].1, SchemeBinding::Token(_)));
    }

    #[test]
    fn inject_oauth2_caches_idempotent() {
        use crate::auth::oauth2::{OAuth2Grant, OAuth2TokenProvider};

        let provider = Arc::new(OAuth2TokenProvider::new(
            "OAuth2",
            "https://example.com/token",
            OAuth2Grant::ClientCredentials {
                client_id_env: "CID".to_string(),
                client_secret_env: "CSEC".to_string(),
                scope: None,
            },
        ));
        let mut bindings: Vec<(String, SchemeBinding)> = vec![(
            "OAuth2".to_string(),
            SchemeBinding::Custom(provider.clone()),
        )];
        inject_oauth2_caches("test-cli", &mut bindings);
        assert!(provider.has_cache());
        // Calling again should be a no-op (OnceLock prevents double-set)
        inject_oauth2_caches("other-cli", &mut bindings);
        assert!(provider.has_cache());
    }
}
