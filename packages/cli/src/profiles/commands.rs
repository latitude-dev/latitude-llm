//! The `profiles` subcommand group: `create`, `list`, `use`, `remove`,
//! `current`.
//!
//! Grafted onto every CLI that opted in, through the same
//! `graft_builtin_command` path `auth` uses — so an API that owns a
//! top-level `profiles` resource gets the built-ins *folded into* its group
//! rather than colliding with it.
//!
//! `list` and `current` render through [`crate::formatter`], so
//! `--format json` works for free and the table form is consistent with
//! every other command on the CLI.

use std::collections::{BTreeMap, BTreeSet};
use std::io::{IsTerminal, Write};

use clap::{Arg, ArgAction, ArgMatches, Command};

use crate::auth::keyring_store::active_store;
use crate::auth::login::{self, DynLoginFlow};
use crate::auth::{AuthCredentialSource, SchemeBinding};
use crate::error::CliError;
use crate::profiles::selection::{self, PROFILE_FLAG};
use crate::profiles::store::{self, ProfileEntry, ProfileStore};
use crate::profiles::ProfilesConfig;

/// Names a profile may not take. `active` is a `profiles.toml` top-level key,
/// and the rest would make `profiles use <name>` ambiguous with a
/// subcommand.
const RESERVED_PROFILE_NAMES: &[&str] = &["create", "list", "use", "remove", "current", "env"];

/// One parameter a binding accepts, as `profiles create` needs to see it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParameterSpec {
    /// A name the parameter answers to — either its wire name or the flag
    /// name `--help` shows. A binding contributes one entry per spelling.
    pub name: String,
    /// The values the parameter accepts, or `None` when it is unconstrained.
    ///
    /// `None` and `Some(vec![])` are deliberately different: the first means
    /// "any string", the second would mean "nothing is valid".
    pub allowed_values: Option<Vec<String>>,
}

impl ParameterSpec {
    pub fn unconstrained(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            allowed_values: None,
        }
    }

    pub fn with_values(name: impl Into<String>, values: Vec<String>) -> Self {
        Self {
            name: name.into(),
            allowed_values: Some(values),
        }
    }
}

/// The names — and, where an enum constrains them, the values — a profile's
/// `parameters` and `server_variables` may reference.
///
/// Collected from the registered bindings so `--set` can reject a name no
/// operation accepts. Without this a typo is a silent no-op: the profile
/// stores `AcountSid`, nothing ever reads it, and the user concludes
/// profiles do not work.
///
/// Values matter for the same reason names do, one step later. A profile
/// default lands in a `clap::Arg`'s `default_value`, so an enum value the
/// spec does not allow makes **every** command carrying that parameter fail
/// with `invalid value 'admin' for '--user-type'` — an error naming a flag
/// the user never passed, from a profile they set days earlier.
///
/// An empty vocabulary disables validation rather than rejecting everything
/// — a binding that cannot enumerate its parameters (GraphQL today) must not
/// make `--set` unusable.
#[derive(Debug, Clone, Default)]
pub struct Vocabulary {
    /// Normalized name → allowed values. `None` means the parameter is
    /// unconstrained *somewhere*, which is enough for any value to be valid.
    parameters: BTreeMap<String, Option<BTreeSet<String>>>,
    /// Original spellings, for error messages and suggestions.
    parameter_labels: BTreeSet<String>,
    pub server_variables: BTreeSet<String>,
    /// Parameters that look like a tenant key — see [`Self::tenant_keys`].
    tenant_keys: BTreeSet<String>,
}

impl Vocabulary {
    /// Fold one binding's parameters in.
    ///
    /// Allowed values are **unioned** across every operation declaring the
    /// name, and any unconstrained occurrence widens it to "anything". Both
    /// follow from what the check is for: rejecting a value that no operation
    /// would accept. A value that one operation accepts and another rejects
    /// is a legitimate configuration — the profile just does not apply
    /// cleanly to every command — and refusing it here would be wrong.
    pub fn add_parameters(&mut self, specs: impl IntoIterator<Item = ParameterSpec>) {
        for spec in specs {
            self.parameter_labels.insert(spec.name.clone());
            let key = crate::text::normalize_identifier(&spec.name);
            let entry = self.parameters.entry(key).or_insert_with(|| Some(BTreeSet::new()));
            match (entry.as_mut(), spec.allowed_values) {
                (Some(known), Some(values)) => known.extend(values),
                // Unconstrained anywhere → unconstrained everywhere.
                (Some(_), None) => *entry = None,
                (None, _) => {}
            }
        }
    }

    /// The parameter names, in their original spellings.
    /// Whether `name` is a parameter this CLI accepts.
    ///
    /// Mirrors [`Self::validate_parameter`]'s forgiving case: a binding that
    /// cannot enumerate its surface (GraphQL today) leaves `parameters` empty,
    /// and rejecting everything there would be worse than accepting it.
    pub fn is_known_parameter(&self, name: &str) -> bool {
        self.parameters.is_empty()
            || self
                .parameters
                .contains_key(&crate::text::normalize_identifier(name))
    }

    pub fn parameter_labels(&self) -> &BTreeSet<String> {
        &self.parameter_labels
    }

    /// Record the parameters a binding considers likely to be profile-scoped.
    ///
    /// See [`Self::tenant_keys`] for what "likely" means and who decides.
    pub fn add_tenant_keys(&mut self, names: impl IntoIterator<Item = String>) {
        self.tenant_keys.extend(names);
    }

    /// Parameters that get their own `--<name>` flag on `profiles create`,
    /// instead of only being reachable through `--set <name>=<value>`.
    ///
    /// A tenant key is structurally a *prefix*: it appears in a non-terminal
    /// path segment of most operations (`/Accounts/{AccountSid}/Messages`).
    /// The binding computes that from the spec — no provider configuration —
    /// so a multi-tenant API surfaces `--account-sid` and a single-tenant one
    /// surfaces nothing at all.
    ///
    /// Deliberately narrow: registering a flag per known parameter would put
    /// hundreds on one subcommand.
    pub fn tenant_keys(&self) -> &BTreeSet<String> {
        &self.tenant_keys
    }

    fn validate_parameter(&self, name: &str, value: &str) -> Result<(), CliError> {
        if self.parameters.is_empty() {
            return Ok(());
        }
        let Some(allowed) = self.parameters.get(&crate::text::normalize_identifier(name)) else {
            return Err(unknown_name_error(
                "parameter",
                name,
                &self.parameter_labels,
                "--set",
            ));
        };
        let Some(allowed) = allowed else {
            return Ok(());
        };
        if allowed.is_empty() || allowed.iter().any(|candidate| candidate == value) {
            return Ok(());
        }
        let suggestion = crate::text::nearest(value, allowed.iter().cloned())
            .map(|candidate| format!(" Did you mean `{candidate}`?"))
            .unwrap_or_default();
        Err(CliError::Validation(format!(
            "--set: `{value}` is not an accepted value for `{name}`.{suggestion} \
             Allowed: {}.",
            allowed.iter().cloned().collect::<Vec<_>>().join(", "),
        )))
    }

    fn validate_server_variable(&self, name: &str) -> Result<(), CliError> {
        if self.server_variables.is_empty() || self.contains(&self.server_variables, name) {
            return Ok(());
        }
        Err(unknown_name_error(
            "server variable",
            name,
            &self.server_variables,
            "--server-var",
        ))
    }

    /// Membership modulo spelling: a spec's `AccountSid` is matched by
    /// `account-sid` and `account_sid`, the two forms a user is likeliest to
    /// type after reading `--help`.
    fn contains(&self, set: &BTreeSet<String>, name: &str) -> bool {
        let wanted = crate::text::normalize_identifier(name);
        set.iter()
            .any(|candidate| crate::text::normalize_identifier(candidate) == wanted)
    }
}

fn unknown_name_error(
    kind: &str,
    name: &str,
    known: &BTreeSet<String>,
    flag: &str,
) -> CliError {
    let suggestion = crate::text::nearest(name, known.iter().cloned())
        .map(|candidate| format!(" Did you mean `{candidate}`?"))
        .unwrap_or_default();
    // The full list is genuinely useful for server variables (there are a
    // handful) and useless for parameters (there can be hundreds), so only
    // enumerate when it stays readable.
    let listing = if known.len() <= 12 {
        format!(
            " Known {kind}s: {}.",
            known.iter().cloned().collect::<Vec<_>>().join(", "),
        )
    } else {
        format!(
            " Run `--schema` to list the {} {kind}s this CLI accepts.",
            known.len(),
        )
    };
    CliError::Validation(format!(
        "{flag}: no operation accepts the {kind} `{name}`.{suggestion}{listing}"
    ))
}

// ── Command construction ────────────────────────────────────────────────

/// Build the `profiles` subtree.
///
/// `vocabulary` shapes the surface: each known server variable also gets a
/// convenience `--<name>` flag on `create`, so a spec that declares
/// `region` / `edge` yields `profiles create au --region au1 --edge sydney`
/// rather than the generic-but-clunky `--server-var region=au1`.
pub fn build_profiles_command(config: &ProfilesConfig, vocabulary: &Vocabulary) -> Command {
    let create = Command::new("create")
        .about("Create or update a named profile")
        .long_about(
            "Create a named bundle of request context: a credential slot, \
             parameter defaults, server variables, and an optional base URL \
             and output format.\n\n\
             Secrets are never written to profiles.toml. `--with-token` and \
             `--from-env` store the credential in the OS keychain under an \
             account scoped to this profile; the file only names that account.\n\n\
             A server-URL template variable can be set either generically \
             (`--server-var region=au1`) or through its own flag, the same one \
             an ordinary command takes (`--region au1`).",
        )
        // Optional because `--profile <name>` may carry it instead. That
        // flag is the global profile *selector* everywhere else, but the
        // `profiles` group runs unprofiled by design, so inside `create`
        // the only thing it can sensibly mean is the profile being created.
        .arg(
            Arg::new("name")
                .value_name("NAME")
                .help("Profile name (or pass it as --profile <NAME>)"),
        )
        .arg(
            Arg::new("parent")
                .long("parent")
                .value_name("PROFILE")
                .help(
                    "Inherit credential, server variables, base URL, and parameter \
                     defaults from another profile (output format is not inherited)",
                ),
        )
        .arg(
            Arg::new("set")
                .long("set")
                .value_name("KEY=VALUE")
                .action(ArgAction::Append)
                .help("Default value for an operation parameter, e.g. --set AccountSid=AC11"),
        )
        .arg(
            Arg::new("server-var")
                .long("server-var")
                .value_name("KEY=VALUE")
                .action(ArgAction::Append)
                // Name the variables this spec actually declares. There are
                // usually a handful, and without them the flag is unusable
                // without going to `--schema` first.
                .help(match server_variable_hint(vocabulary) {
                    Some(hint) => format!("Value for a server-URL template variable ({hint})"),
                    None => "Value for a server-URL template variable, e.g. --server-var region=us1"
                        .to_string(),
                }),
        )
        .arg(
            Arg::new("base-url")
                .long("base-url")
                .value_name("URL")
                .help("Explicit base-URL override for this profile"),
        )
        // Deliberately NOT `--format`: that is the global output flag on every
        // other command in the CLI, and a `create` arg with the same clap id
        // would shadow it — so `profiles create p --format json` would set the
        // profile's stored format while looking like a request for JSON
        // output. `--base-url` below *does* keep its name, because on a
        // command that sends no request the only thing it could mean is the
        // profile's.
        .arg(
            Arg::new("retries")
                .long("retries")
                .value_name("N")
                .value_parser(clap::value_parser!(u32))
                .help(
                    "Additional retry attempts for requests made under this profile \
                     (0 disables retries here). Overrides x-fern-retries; an explicit \
                     --retries or <NAME>_RETRIES on the command still wins.",
                ),
        )
        .arg(
            Arg::new("default-format")
                .long("default-format")
                .value_name("FORMAT")
                .help("Default output format for this profile (json, table, yaml, csv, jsonl)"),
        )
        .arg(
            Arg::new("credential")
                .long("credential")
                .value_name("ACCOUNT")
                .help(
                    "Keyring account this profile's credentials live under \
                     (defaults to the profile name)",
                ),
        )
        .arg(
            Arg::new("oauth-client-id")
                .long("oauth-client-id")
                .value_name("ID")
                .help("OAuth client id for this profile (the client secret goes to the keychain)"),
        )
        .arg(
            Arg::new("with-token")
                .long("with-token")
                .action(ArgAction::SetTrue)
                .help("Read a credential from stdin into this profile's keychain slot")
                .conflicts_with("from-env"),
        )
        .arg(
            Arg::new("from-env")
                .long("from-env")
                .action(ArgAction::SetTrue)
                .help(
                    "Capture the credential currently supplied by environment \
                     variables into this profile's keychain slot",
                ),
        )
        .arg(
            Arg::new("scheme")
                .long("scheme")
                .value_name("NAME")
                .help("Auth scheme for --with-token / --from-env (required when several are declared)"),
        )
        .arg(
            Arg::new("force")
                .long("force")
                .action(ArgAction::SetTrue)
                .help("Overwrite an existing profile instead of erroring"),
        )
        .arg(
            Arg::new("use")
                .long("use")
                .action(ArgAction::SetTrue)
                .help("Make this the active profile after creating it"),
        );

    // A `--<tenant-key>` flag per parameter the spec scopes most operations
    // by, so the commonest profile field is not stuck behind `--set`. Path
    // parameters have no root-level global, so unlike server variables there
    // is nothing here to collide with — but the reserved-name check stays,
    // because `create` owns a handful of long names of its own.
    let mut create = create;
    for name in vocabulary.tenant_keys() {
        let kebab = crate::text::to_kebab_flag(name);
        if create_owns_flag(&kebab) {
            continue;
        }
        create = create.arg(
            Arg::new(format!("tenant-key:{name}"))
                .long(kebab)
                .value_name(crate::text::to_screaming_snake(name))
                .help(format!("Value for the `{name}` parameter in this profile")),
        );
    }

    Command::new(config.command_name.clone())
        .about("Manage named profiles (credentials, parameter defaults, regions)")
        .long_about(
            "A profile is a named bundle of request context resolved once per \
             invocation. Select one for a single command with `--profile <name>` \
             (`-p`), for a shell with the <NAME>_PROFILE environment variable, or \
             persistently with `profiles use <name>`.\n\n\
             Precedence per value is: explicit flag, then environment variable, \
             then profile, then the spec's own default. Environment variables sit \
             above profiles so a CI pipeline is never silently overridden by a \
             developer's stored profile.",
        )
        .arg_required_else_help(true)
        .subcommand(create)
        .subcommand(
            Command::new("list")
                .visible_alias("ls")
                .about("List every profile, marking the active one"),
        )
        .subcommand(
            Command::new("use")
                .about("Set the active profile")
                .arg(
                    Arg::new("name")
                        .required(true)
                        .value_name("NAME")
                        .help("Profile to activate, or `-` to clear the active profile"),
                ),
        )
        .subcommand(
            Command::new("show")
                .about("Show one profile's resolved config, without selecting it")
                .arg(
                    Arg::new("name")
                        .value_name("NAME")
                        .help(
                            "Profile to inspect. Defaults to the one this invocation \
                             would use (--profile, <NAME>_PROFILE, or the active one).",
                        ),
                ),
        )
        .subcommand(
            Command::new("set")
                .about("Set credentials or settings on a profile, by the name you already use")
                .arg(
                    Arg::new("name")
                        .value_name("NAME")
                        .required(true)
                        .help("Profile to modify; created if it does not exist"),
                )
                .arg(
                    Arg::new("assignments")
                        .value_name("KEY=VALUE")
                        .required(true)
                        .num_args(1..)
                        .help(
                            "One or more assignments. KEY may be an environment variable \
                             this CLI reads (a credential, or a setting such as \
                             <NAME>_RETRIES) or an API parameter name. Credentials go to \
                             the keyring; everything else to profiles.toml.",
                        ),
                ),
        )
        .subcommand(build_remove_command(config))
        .subcommand(
            Command::new("current").about("Show the profile this invocation would use, and why"),
        )
}

/// A `--help` fragment naming the spec's server variables, e.g.
/// `"region, edge"`. `None` when the spec declares none, so the flag falls
/// back to a generic example rather than advertising an empty list.
/// Long names `profiles create` already registers, plus the global
/// `--profile` it reinterprets. A tenant key landing on one of these keeps
/// `--set <name>=<value>` as its way in rather than shadowing a flag.
fn create_owns_flag(kebab: &str) -> bool {
    matches!(
        kebab,
        "name" | "parent" | "set" | "server-var" | "base-url" | "default-format"
            | "retries"
            | "credential" | "oauth-client-id" | "with-token" | "scheme" | "from-env"
            | "force" | "use" | "help"
    ) || kebab == PROFILE_FLAG
}

fn server_variable_hint(vocabulary: &Vocabulary) -> Option<String> {
    if vocabulary.server_variables.is_empty() {
        return None;
    }
    let names: Vec<&str> = vocabulary
        .server_variables
        .iter()
        .map(String::as_str)
        .collect();
    Some(format!("this API declares: {}", names.join(", ")))
}

/// `profiles remove`, with `--revoke` only when the generator named an
/// operation for it. Registering the flag unconditionally would advertise a
/// capability the binary does not have.
fn build_remove_command(config: &ProfilesConfig) -> Command {
    let remove = Command::new("remove")
        .visible_alias("rm")
        .about("Delete a profile and its stored credentials")
        .arg(
            Arg::new("name")
                .required(true)
                .value_name("NAME")
                .help("Profile to delete"),
        )
        .arg(
            Arg::new("yes")
                .long("yes")
                .short('y')
                .action(ArgAction::SetTrue)
                .help("Skip the confirmation prompt"),
        );
    match &config.revoke_operation {
        Some(op) => remove.arg(
            Arg::new("revoke")
                .long("revoke")
                .action(ArgAction::SetTrue)
                .help(format!(
                    "Also revoke this profile's remote credential (runs `{}`)",
                    op.replace('.', " "),
                )),
        ),
        None => remove,
    }
}

/// The subcommand names [`build_profiles_command`] owns.
///
/// Mirrors how `dispatch_auth` is gated on `login | logout | status`: when a
/// spec also declares a `profiles` group, only these leaves are intercepted
/// and everything else falls through to the spec's binding.
pub const BUILTIN_SUBCOMMANDS: &[&str] = &["create", "list", "ls", "use",
    "set", "remove", "rm", "current", "show"];

// ── Dispatch ────────────────────────────────────────────────────────────

/// Runtime dependencies the `profiles` subcommands need. Bundled into a
/// struct because five of the six handlers want a different subset of the
/// same six values, and threading them positionally invites a mix-up
/// between `cli_name` and a profile name.
pub struct ProfilesContext<'a> {
    pub cli_name: &'a str,
    /// The registered bindings, so `remove --revoke` can call the API.
    pub bindings: &'a [Box<dyn crate::binding::Binding>],
    /// Command path of the revoke operation, when one is configured.
    pub revoke_op_path: Option<Vec<String>>,
    /// The configured group name. Carried rather than assumed, so a CLI that
    /// renamed the group (`commandName: tenants`) does not get hints telling
    /// it to run `<bin> profiles use …`, which would not resolve.
    pub command_name: &'a str,
    pub auth_bindings: &'a [(String, SchemeBinding)],
    pub login_flows: &'a [DynLoginFlow],
    pub vocabulary: &'a Vocabulary,
}

/// Dispatch into the matched `profiles` subcommand.
///
/// `out` is the stdout sink used for machine-readable output; human progress
/// goes to stderr, matching `dispatch_auth`.
pub async fn dispatch_profiles<W: Write>(
    matches: &ArgMatches,
    ctx: &ProfilesContext<'_>,
    out: &mut W,
) -> Result<(), CliError> {
    let mut store = open_store(ctx.cli_name)?;
    match matches.subcommand() {
        Some(("create", m)) => handle_create(m, ctx, &mut store),
        Some(("list" | "ls", m)) => handle_list(m, ctx, &store, out),
        Some(("use", m)) => handle_use(m, ctx, &mut store),
        Some(("set", m)) => handle_set(m, ctx, &mut store),
        Some(("show", m)) => handle_show(m, ctx, &store, out),
        Some(("remove" | "rm", m)) => handle_remove(m, ctx, &mut store).await,
        Some(("current", m)) => handle_current(m, ctx, &store, out),
        _ => Err(CliError::Validation(
            "profiles requires a subcommand: create, list, use, remove, or current".to_string(),
        )),
    }
}

/// This process's argv, for re-resolving the selection inside the `profiles`
/// group.
///
/// `dispatch_profiles` only receives the group's own `ArgMatches`, and
/// `--profile` is read pre-clap from raw argv anyway (see
/// [`selection::extract_profile_flag`]), so the raw vector is the honest
/// input here rather than a value threaded down from the parse.
fn argv() -> Vec<String> {
    std::env::args().collect()
}

fn open_store(cli_name: &str) -> Result<ProfileStore, CliError> {
    ProfileStore::for_cli(cli_name).ok_or_else(|| {
        CliError::Validation(
            "cannot locate a home directory, so profiles cannot be stored. \
             Set HOME (or USERPROFILE on Windows) and try again."
                .to_string(),
        )
    })
}

// ── create ──────────────────────────────────────────────────────────────

fn handle_create(
    matches: &ArgMatches,
    ctx: &ProfilesContext<'_>,
    store: &mut ProfileStore,
) -> Result<(), CliError> {
    let name = matches
        .get_one::<String>("name")
        .cloned()
        // The global `--profile`, reinterpreted as the name here.
        .or_else(|| {
            matches
                .try_get_one::<String>(PROFILE_FLAG)
                .ok()
                .flatten()
                .cloned()
        })
        .ok_or_else(|| {
            CliError::Validation(
                "profiles create needs a name: `profiles create <NAME>` or \
                 `profiles create --profile <NAME>`."
                    .to_string(),
            )
        })?;
    validate_profile_name(&name)?;

    let existing = store.entry(&name);
    if existing.is_some() && !matches.get_flag("force") {
        return Err(CliError::Validation(format!(
            "profile `{name}` already exists. Pass --force to overwrite it."
        )));
    }

    if let Some(parent) = matches.get_one::<String>("parent") {
        if parent == &name {
            return Err(CliError::Validation(format!(
                "profile `{name}` cannot be its own parent"
            )));
        }
        if store.entry(parent).is_none() {
            return Err(store::unknown_profile(store, parent));
        }
    }

    // Start from the existing entry under `--force` so a re-run that only
    // passes `--set` does not silently wipe the profile's other fields.
    let mut entry = existing.unwrap_or_else(|| ProfileEntry {
        name: name.clone(),
        ..Default::default()
    });
    if let Some(parent) = matches.get_one::<String>("parent") {
        entry.parent = Some(parent.clone());
    }
    if let Some(credential) = matches.get_one::<String>("credential") {
        entry.credential = Some(credential.clone());
    }
    if let Some(client_id) = matches.get_one::<String>("oauth-client-id") {
        entry.oauth_client_id = Some(client_id.clone());
    }
    if let Some(base_url) = matches.get_one::<String>("base-url") {
        crate::output::reject_dangerous_chars(base_url, "--base-url")?;
        entry.base_url = Some(base_url.clone());
    }
    if let Some(retries) = matches.get_one::<u32>("retries") {
        entry.retries = Some(*retries);
    }
    if let Some(format) = matches.get_one::<String>("default-format") {
        // Validated here rather than at read time: a profile that stores an
        // unknown format would fail every subsequent command with an error
        // that points at `--format`, a flag the user did not pass.
        crate::formatter::OutputFormat::parse(format)
            .map_err(CliError::Validation)?;
        entry.format = Some(format.clone());
    }

    for (key, value) in parse_key_values(matches, "set", "--set")? {
        ctx.vocabulary.validate_parameter(&key, &value)?;
        entry.parameters.insert(key, value);
    }
    for (key, value) in parse_key_values(matches, "server-var", "--server-var")? {
        ctx.vocabulary.validate_server_variable(&key)?;
        entry.server_variables.insert(key, value);
    }
    // Tenant-key convenience flags (`--account-sid AC99`).
    for name in ctx.vocabulary.tenant_keys() {
        if let Some(value) = matches
            .try_get_one::<String>(&format!("tenant-key:{name}"))
            .ok()
            .flatten()
        {
            ctx.vocabulary.validate_parameter(name, value)?;
            entry.parameters.insert(name.clone(), value.clone());
        }
    }

    // A server variable's own global flag (`--region au1`) also sets it.
    //
    // Read from the propagated global rather than a `create`-local
    // convenience flag: those are registered on the root with `.global(true)`,
    // and clap copies a global into a subcommand only when the subcommand has
    // no arg with the *same id*. A second `--region` under a different id
    // (`server-var:region`) is two args with one long name, which makes clap
    // reject the whole command tree at startup — every invocation panics, not
    // just `profiles create`.
    //
    // Only `CommandLine` counts. A spec server variable's flag carries the
    // variable's `default`, so accepting `DefaultValue` here would silently
    // freeze `region = "us1"` into every profile the user creates.
    for variable in &ctx.vocabulary.server_variables {
        let Ok(Some(value)) = matches.try_get_one::<String>(variable) else {
            continue;
        };
        if matches.value_source(variable) != Some(clap::parser::ValueSource::CommandLine) {
            continue;
        }
        entry.server_variables.insert(variable.clone(), value.clone());
    }

    // Supplying a credential means this profile owns one, so it must not be
    // written into the slot it would otherwise *inherit*.
    //
    // `resolve` fills an absent `credential` with the chain root's name, which
    // is what makes `--parent` mean "same account, different context". But
    // `create child --parent prod --with-token` then wrote the child's
    // credential to `<scheme>#prod`, overwriting the parent's — so two
    // children clobbered each other and the parent, and all three resolved to
    // whichever was written last. Silent credential corruption.
    //
    // An explicit `--credential` still wins: sharing a slot deliberately is a
    // supported thing to ask for.
    if (matches.get_flag("with-token") || matches.get_flag("from-env"))
        && matches.get_one::<String>("credential").is_none()
    {
        entry.credential = Some(name.clone());
    }

    // Resolve now, before writing, so a bad `--parent` (cycle, depth) is
    // rejected instead of persisted and hit on the next command.
    let mut probe = store.clone();
    probe.upsert(&entry);
    let resolved = store::resolve(&probe, &name)?;

    // Credential capture happens before the write: if the keychain refuses,
    // we must not leave a profile pointing at an empty slot.
    let mut stderr = std::io::stderr();
    if matches.get_flag("with-token") || matches.get_flag("from-env") {
        let scheme = login::resolve_scheme_for(
            matches.get_one::<String>("scheme"),
            ctx.auth_bindings,
            ctx.login_flows,
        )?;
        let account = super::keyring_account_for(
            &scheme,
            resolved.credential.as_deref().unwrap_or(&name),
        );
        // Some schemes take several values (basic: username + password;
        // OAuth2 client credentials: client id + secret) and are stored as
        // one JSON entry. The scheme declares which.
        let fields = login::scheme_credential_fields(&scheme, ctx.auth_bindings);
        let stored = match (matches.get_flag("with-token"), fields) {
            (true, Some(fields)) => {
                login::multi_field_keyring_value(&login::read_fields_from_stdin(&fields)?)?
            }
            (true, None) => login::read_token_from_stdin()?,
            (false, Some(fields)) => {
                let captured = login::env_multi_credential(ctx.auth_bindings, &scheme, &fields)
                    .ok_or_else(|| {
                        login::from_env_error(ctx.cli_name, &scheme, &fields.join(" and "))
                    })?;
                login::multi_field_keyring_value(&captured)?
            }
            (false, None) => login::env_credential(ctx.auth_bindings, &scheme)
                .ok_or_else(|| login::from_env_error(ctx.cli_name, &scheme, "a credential"))?,
        };
        active_store().set(ctx.cli_name, &account, &stored)?;
        let _ = writeln!(
            stderr,
            "{}",
            login::green(&format!(
                "✓ Stored credential for profile `{name}` (scheme {scheme}) in {}",
                active_store().backend_label(),
            )),
        );
        // The same warning `auth login --with-token` emits, and for a sharper
        // reason: `--from-env` *reads* the env var, so without this the user
        // is told the capture succeeded and never learns that the variable
        // they captured from will keep winning over the copy they just made.
        login::warn_if_env_shadows(
            &mut stderr,
            &login::shadowing_env_vars(ctx.cli_name, &scheme, ctx.auth_bindings),
        );
    }

    store.upsert(&entry);
    if matches.get_flag("use") {
        store.set_active(&name);
    }
    store.save()?;

    let verb = if existing_was_updated(matches) {
        "Updated"
    } else {
        "Created"
    };
    let _ = writeln!(
        stderr,
        "{}",
        login::green(&format!(
            "✓ {verb} profile `{name}` in {}",
            store.path().display(),
        )),
    );
    if matches.get_flag("use") {
        let _ = writeln!(stderr, "  Active profile is now `{name}`.");
    } else {
        let _ = writeln!(
            stderr,
            "  Run `{} {} use {name}` to make it active, or pass `-p {name}` per command.",
            ctx.cli_name,
            ctx.command_name,
        );
    }

    // `profiles create <name>` on its own stores no credential, and saying so
    // is the difference between a working first five minutes and a confusing
    // hour. Without this the next `auth status` reports every keyring rung as
    // `missing` and the user has no idea which command was supposed to fill
    // them, or that `create` was never going to.
    //
    // Suppressed when a credential was just captured, when the profile
    // inherits one, and when env vars already supply it — in those cases
    // nothing is missing and the line would be noise.
    let captured = matches.get_flag("with-token") || matches.get_flag("from-env");
    let inherits = entry.parent.is_some() || matches.get_one::<String>("credential").is_some();
    if !captured && !inherits && !any_env_credential(ctx) {
        let _ = writeln!(
            stderr,
            "  No credential stored yet. Run `{} auth login` (or re-run with \
             `--from-env` to capture one already in your shell).",
            ctx.cli_name,
        );
    }
    Ok(())
}

/// Whether environment variables already supply a credential, in which case
/// the "no credential stored" hint would be misleading — the CLI works.
fn any_env_credential(ctx: &ProfilesContext<'_>) -> bool {
    ctx.auth_bindings.iter().any(|(scheme, binding)| {
        credential_sources(scheme, binding, ctx.login_flows, ctx.cli_name)
            .into_iter()
            .any(|source| {
                matches!(source, AuthCredentialSource::Env(_)) && source.resolve().is_some()
            })
    })
}

/// Whether `create` overwrote an existing profile. Read from the flag rather
/// than re-reading the store, which has already been mutated by this point.
fn existing_was_updated(matches: &ArgMatches) -> bool {
    matches.get_flag("force")
}

fn validate_profile_name(name: &str) -> Result<(), CliError> {
    if name.is_empty() {
        return Err(CliError::Validation("profile name must not be empty".to_string()));
    }
    if RESERVED_PROFILE_NAMES.contains(&name) {
        return Err(CliError::Validation(format!(
            "`{name}` is reserved and cannot be used as a profile name"
        )));
    }
    // The name becomes a TOML bare key, a keyring account suffix, and half of
    // a token-cache key. Restricting it to this set keeps all three
    // unambiguous — notably `#`, which separates the scheme from the
    // credential in a keyring account.
    if !name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
    {
        return Err(CliError::Validation(format!(
            "profile name `{name}` contains unsupported characters. \
             Use letters, digits, `-`, `_`, and `.`."
        )));
    }
    Ok(())
}

/// Parse repeated `KEY=VALUE` flag values.
///
/// An empty key or a missing `=` is an error rather than a skip: `--set
/// AccountSid` looks like it worked, and a silently ignored default is the
/// exact failure mode this feature has to avoid.
fn parse_key_values(
    matches: &ArgMatches,
    id: &str,
    flag: &str,
) -> Result<Vec<(String, String)>, CliError> {
    let mut out = Vec::new();
    let Some(values) = matches.get_many::<String>(id) else {
        return Ok(out);
    };
    for raw in values {
        let Some((key, value)) = raw.split_once('=') else {
            return Err(CliError::Validation(format!(
                "{flag}: expected KEY=VALUE, got `{raw}`"
            )));
        };
        let key = key.trim();
        if key.is_empty() {
            return Err(CliError::Validation(format!(
                "{flag}: expected KEY=VALUE, got `{raw}` (empty key)"
            )));
        }
        out.push((key.to_string(), value.to_string()));
    }
    Ok(out)
}

/// Every leaf credential source a scheme reads, required and alternative
/// alike, flattened in the order `auth status` renders them.
///
/// `CredentialSlots` splits sources into "all of these must resolve" and
/// "any one of these suffices" — a distinction that matters for deciding
/// whether a scheme is satisfied, and not at all for the two things below,
/// which only ask "which env vars does this scheme read?". Flattening in one
/// place keeps the two callers from answering that differently.
pub(crate) fn credential_sources(
    scheme: &str,
    binding: &SchemeBinding,
    login_flows: &[DynLoginFlow],
    cli_name: &str,
) -> Vec<AuthCredentialSource> {
    let slots = login::expand_slots(scheme, binding, login_flows, cli_name);
    slots
        .required
        .into_iter()
        .flatten()
        .chain(slots.alternatives)
        .collect()
}


// ── list ────────────────────────────────────────────────────────────────

fn handle_list<W: Write>(
    matches: &ArgMatches,
    ctx: &ProfilesContext<'_>,
    store: &ProfileStore,
    out: &mut W,
) -> Result<(), CliError> {
    // Re-resolve rather than reading the installed global: the `profiles`
    // group is exempted from selection (so `use` / `remove` keep working when
    // `active` is stale), which means the global is empty here. Falling back
    // to the raw `active` key covers the stale case — the entry the user has
    // to fix is exactly the one that must still be visible.
    let active_name = selection::resolve_selection_in(store, ctx.cli_name, &argv())
        .ok()
        .flatten()
        .map(|selection| selection.profile.name)
        .or_else(|| store.active().map(str::to_string));
    let mut rows: Vec<serde_json::Value> = Vec::new();

    for entry in store.entries() {
        // Render the *resolved* view: a subaccount profile's inherited
        // credential and region are what the next request will use, and a
        // listing that showed only the literal file contents would leave the
        // user to do the inheritance in their head.
        let resolved = store::resolve(store, &entry.name).ok();
        let mut row = serde_json::Map::new();
        row.insert("profile".into(), entry.name.clone().into());
        row.insert(
            "active".into(),
            if active_name.as_deref() == Some(entry.name.as_str()) {
                "*".into()
            } else {
                "".into()
            },
        );
        if let Some(parent) = &entry.parent {
            row.insert("parent".into(), parent.clone().into());
        }
        if let Some(resolved) = &resolved {
            if let Some(credential) = &resolved.credential {
                // The identifier, when we can read it — that is the question a
                // listing should answer. See `stored_account`.
                if let Some(account) = stored_account(ctx, credential) {
                    row.insert("account".into(), account.into());
                }
                // The *slot* only when it is not this profile's own. Emitting
                // it unconditionally printed `prod -> prod` on every row: true,
                // redundant, and it crowded out the columns that carry
                // information.
                if credential != &entry.name {
                    row.insert("credentials_from".into(), credential.clone().into());
                }
            }
            if let Some(client_id) = &resolved.oauth_client_id {
                row.insert("oauth_client_id".into(), client_id.clone().into());
            }
            if let Some(base_url) = &resolved.base_url {
                row.insert("base_url".into(), base_url.clone().into());
            }
            if let Some(retries) = resolved.retries {
                row.insert("retries".into(), retries.into());
            }
            if let Some(format) = &resolved.format {
                row.insert("format".into(), format.clone().into());
            }
            insert_map(&mut row, "parameters", &resolved.parameters);
            insert_map(&mut row, "server_variables", &resolved.server_variables);
        } else {
            // A profile whose parent chain is broken still has to appear —
            // otherwise the user cannot see the entry they need to fix.
            row.insert("error".into(), "unresolvable (check `parent`)".into());
        }
        rows.push(serde_json::Value::Object(row));
    }

    // The `[env]` pseudo-row: env credentials outrank every profile, so a
    // listing that omitted them would answer "which account am I about to
    // hit?" wrongly whenever one is exported. This is a rendering of what
    // `auth status` already detects, not new detection.
    if let Some(row) = env_pseudo_row(ctx) {
        rows.push(row);
    }
    warn_about_near_miss_env_vars(ctx);

    let pipeline = crate::formatter::OutputPipeline::from_matches(matches, ctx.cli_name)
        .map_err(|e| CliError::Validation(e.to_string()))?;
    if rows.is_empty() && !pipeline.format.is_machine_readable() {
        let _ = writeln!(
            std::io::stderr(),
            "No profiles configured. Create one with `{} {} create <name>`.",
            ctx.cli_name,
            ctx.command_name,
        );
        return Ok(());
    }
    // Machine formats get the rows verbatim — key order is not part of a
    // JSON/YAML contract, and a caller reads by name.
    if pipeline.format.is_machine_readable() {
        pipeline
            .emit(out, &serde_json::Value::Array(rows), false, true)
            .map_err(|e| CliError::Other(e.into()))?;
        return Ok(());
    }
    // Human table: rendered here rather than through the generic formatter,
    // which orders columns by JSON key and so puts `active` first and
    // `profile` in the middle. This is the one command whose column order is
    // itself the information — you scan for the profile name and the `*`.
    write!(out, "{}", render_profiles_table(&rows)).map_err(|e| CliError::Other(e.into()))?;
    Ok(())
}

/// Render `profiles list` as a fixed-order table:
/// `PROFILE  <fields…>  ACTIVE`.
///
/// The middle columns are whatever the profiles actually carry — parameters
/// and server variables, flattened and uppercased — so a multi-tenant API
/// shows `ACCOUNT-SID REGION EDGE` and a plain one shows nothing between the
/// two fixed columns. Nothing here is provider-specific.
fn render_profiles_table(rows: &[serde_json::Value]) -> String {
    const FIRST: &str = "profile";
    const LAST: &str = "active";

    // Column discovery across rows, so a field only some profiles set still
    // gets a column. `serde_json::Map` is a `BTreeMap`, so raw discovery order
    // is alphabetical — which put the wide `NOTE` prose ahead of the value it
    // annotates. Rank known columns explicitly and leave the rest alphabetical
    // between them, so the layout is deterministic and reads identifier-first.
    const EARLY: &[&str] = &[
        "account",
        "variables",
        "credentials_from",
        "parent",
        "base_url",
        "retries",
        "format",
    ];
    fn rank(key: &str) -> usize {
        if let Some(index) = EARLY.iter().position(|candidate| *candidate == key) {
            return index;
        }
        // Prose last: it explains the row rather than carrying a value.
        match key {
            "note" | "error" => EARLY.len() + 1,
            _ => EARLY.len(),
        }
    }

    let mut middle: Vec<String> = Vec::new();
    for row in rows {
        for key in flatten_row(row).into_iter().map(|(k, _)| k) {
            if key != FIRST && key != LAST && !middle.contains(&key) {
                middle.push(key);
            }
        }
    }
    middle.sort_by(|a, b| rank(a).cmp(&rank(b)).then_with(|| a.cmp(b)));
    let columns: Vec<String> = std::iter::once(FIRST.to_string())
        .chain(middle)
        .chain(std::iter::once(LAST.to_string()))
        .collect();

    let header: Vec<String> = columns
        .iter()
        .map(|c| c.rsplit('.').next().unwrap_or(c).to_uppercase())
        .collect();
    let cells: Vec<Vec<String>> = rows
        .iter()
        .map(|row| {
            let flat = flatten_row(row);
            columns
                .iter()
                .map(|c| {
                    flat.iter()
                        .find(|(k, _)| k == c)
                        .map(|(_, v)| v.clone())
                        .unwrap_or_default()
                })
                .collect()
        })
        .collect();

    let widths: Vec<usize> = columns
        .iter()
        .enumerate()
        .map(|(i, _)| {
            cells
                .iter()
                .map(|row| row[i].chars().count())
                .chain(std::iter::once(header[i].chars().count()))
                .max()
                .unwrap_or(0)
        })
        .collect();

    let line = |values: &[String]| {
        values
            .iter()
            .enumerate()
            .map(|(i, v)| format!("{v:<width$}", width = widths[i]))
            .collect::<Vec<_>>()
            .join("  ")
            .trim_end()
            .to_string()
    };

    let mut out = String::new();
    out.push_str(&line(&header));
    out.push('\n');
    for row in &cells {
        out.push_str(&line(row));
        out.push('\n');
    }
    out
}

/// Flatten one row to `(dotted.key, cell)` pairs, so `parameters.AccountSid`
/// becomes a column the same way the generic table formatter would.
fn flatten_row(row: &serde_json::Value) -> Vec<(String, String)> {
    let mut out = Vec::new();
    let Some(object) = row.as_object() else {
        return out;
    };
    for (key, value) in object {
        match value {
            serde_json::Value::Object(nested) => {
                for (inner, inner_value) in nested {
                    out.push((
                        format!("{key}.{inner}"),
                        inner_value.as_str().unwrap_or_default().to_string(),
                    ));
                }
            }
            serde_json::Value::String(text) => out.push((key.clone(), text.clone())),
            other => out.push((key.clone(), other.to_string())),
        }
    }
    out
}

fn insert_map(
    row: &mut serde_json::Map<String, serde_json::Value>,
    key: &str,
    values: &BTreeMap<String, String>,
) {
    if values.is_empty() {
        return;
    }
    let nested: serde_json::Map<String, serde_json::Value> = values
        .iter()
        .map(|(k, v)| (k.clone(), serde_json::Value::String(v.clone())))
        .collect();
    row.insert(key.to_string(), serde_json::Value::Object(nested));
}

/// The account identifier stored for `credential`, for the `ACCOUNT` column.
///
/// Reads the *username* half of a stored basic credential — `AC1234…` for a
/// Twilio-shaped API. A username is not a secret, so surfacing it is safe, and
/// it is what a user actually wants the listing to answer: "which account is
/// this profile?" The `CREDENTIALS FROM` column can only answer "which slot",
/// which is the same as the profile name in the common case and therefore
/// tells them nothing.
///
/// Returns `None` — and the column disappears — when:
/// - no scheme has a `username` field (bearer / API-key CLIs have no account)
/// - nothing is stored yet for this profile
/// - the keyring read fails or is locked
///
/// That last case is deliberate: `profiles list` must never error or block on
/// a locked keychain just to render a column.
fn stored_account(ctx: &ProfilesContext<'_>, credential: &str) -> Option<String> {
    for (scheme, binding) in ctx.auth_bindings {
        if !matches!(binding, SchemeBinding::Basic { .. }) {
            continue;
        }
        let account = super::keyring_account_for(scheme, credential);
        let Ok(Some(raw)) = crate::auth::keyring_store::active_store().get(ctx.cli_name, &account)
        else {
            continue;
        };
        let username = serde_json::from_str::<serde_json::Value>(&raw)
            .ok()
            .and_then(|v| v.get("username")?.as_str().map(str::to_string));
        if let Some(username) = username.filter(|u| !u.is_empty()) {
            return Some(truncate_account(&username));
        }
    }
    None
}

/// Shorten a long identifier for a table cell, keeping the leading characters
/// that distinguish accounts (`AC1234…`). Twilio SIDs are 34 characters, which
/// would dominate the row.
fn truncate_account(value: &str) -> String {
    const KEEP: usize = 10;
    if value.chars().count() <= KEEP + 1 {
        return value.to_string();
    }
    let head: String = value.chars().take(KEEP).collect();
    format!("{head}\u{2026}")
}

/// Warn about a variable that is set, looks like one of this CLI's credential
/// variables, and is not read.
///
/// `TWILIO_ACCOUNT_ID` instead of `TWILIO_ACCOUNT_SID` produced no diagnostic
/// at all: the variable is simply not consulted, so nothing fires, and the
/// only hint was the `[env]` row listing one name where the user expected two.
/// Scoped to declared names that are *unset* while a near neighbour *is* set,
/// so it cannot fire on the hundreds of unrelated variables in a shell.
fn warn_about_near_miss_env_vars(ctx: &ProfilesContext<'_>) {
    let mut declared: Vec<String> = Vec::new();
    for (scheme, binding) in ctx.auth_bindings {
        for source in credential_sources(scheme, binding, ctx.login_flows, ctx.cli_name) {
            if let AuthCredentialSource::Env(name) = source {
                if !declared.contains(&name) {
                    declared.push(name);
                }
            }
        }
    }
    let set_in_env: Vec<String> = std::env::vars_os()
        .filter_map(|(key, _)| key.into_string().ok())
        .collect();

    let mut stderr = std::io::stderr();
    for name in &declared {
        if std::env::var_os(name).is_some() {
            continue;
        }
        // A near neighbour that *is* set, and that this CLI does not read.
        let Some(hit) = crate::text::nearest(name, set_in_env.iter().cloned()) else {
            continue;
        };
        if declared.contains(&hit) || hit == *name {
            continue;
        }
        let _ = writeln!(
            stderr,
            "{}",
            login::yellow(&format!(
                "\u{26a0} `{hit}` is set but this CLI does not read it. Did you mean `{name}`?",
            )),
        );
    }
}

/// Whether environment variables alone fully satisfy at least one scheme.
///
/// Distinguishes "env is what will be sent" from "env supplies one half of a
/// two-value credential and nothing authenticates". Both states involve env
/// vars outranking the keyring; only the first is an override.
fn env_satisfies_a_scheme(ctx: &ProfilesContext<'_>) -> bool {
    ctx.auth_bindings.iter().any(|(scheme, binding)| {
        let slots = login::expand_slots(scheme, binding, ctx.login_flows, ctx.cli_name);
        !slots.required.is_empty()
            && slots.required.iter().all(|slot| {
                slot.iter().any(|source| {
                    matches!(source, AuthCredentialSource::Env(_)) && source.resolve().is_some()
                })
            })
    })
}

/// A synthetic `[env]` row when environment variables currently supply a
/// credential — which wins over an *ambiently* selected profile
/// (`<BIN>_PROFILE`, `profiles use`) but not over an explicitly named
/// `--profile`, whose stored credentials outrank it.
fn env_pseudo_row(ctx: &ProfilesContext<'_>) -> Option<serde_json::Value> {
    let mut sources: Vec<String> = Vec::new();
    for (scheme, binding) in ctx.auth_bindings {
        for source in credential_sources(scheme, binding, ctx.login_flows, ctx.cli_name) {
            if let AuthCredentialSource::Env(name) = &source {
                if source.resolve().is_some() {
                    sources.push(name.clone());
                }
            }
        }
    }
    if sources.is_empty() {
        return None;
    }
    sources.sort();
    sources.dedup();
    let mut row = serde_json::Map::new();
    row.insert("profile".into(), "[env]".into());
    // Deliberately *not* marked active. `ACTIVE` means "this is the selected
    // profile", and this row is not a profile — it is what currently supplies
    // credentials. Marking both put two `*` in one column and left the reader
    // unable to say which was in effect, when the honest answer is that both
    // are: the active profile still provides region, parameters, retries and
    // base URL while these variables provide the credential. The note carries
    // that, and `auth status` shows it per scheme.
    row.insert("active".into(), "".into());
    // `variables`, not `credential`: this row lists *environment variable
    // names*, and reusing the profile key put them under a `CREDENTIAL` header
    // that every real profile row then left blank. The profile rows' own
    // identifier column is `account`; their slot pointer is `credentials_from`.
    row.insert("variables".into(), sources.join(", ").into());
    row.insert("note".into(), env_row_note().into());
    Some(serde_json::Value::Object(row))
}

/// The `[env]` row's note. It states a precedence rule, so it has to track the
/// one the request path actually applies: under an explicitly named
/// `--profile`, that profile's stored credentials are preferred when a scheme
/// is chosen, and telling the reader env "overrides" them would be exactly
/// backwards. This row is what a user diagnosing a precedence surprise reads
/// first, so a stale claim here costs more than it looks.
fn env_row_note() -> &'static str {
    if crate::profiles::outranks_env() {
        "supplies the credential, but the named profile's stored one is preferred"
    } else {
        "supplies the credential; overrides the active profile's stored one"
    }
}

// ── set ─────────────────────────────────────────────────────────────────

/// Where one `KEY=VALUE` assignment belongs.
enum SetTarget {
    /// A credential env var. Carries every (scheme, field) it maps to — one
    /// var is frequently declared by several schemes, and writing only the
    /// first would leave the others unauthenticated with no indication why.
    Credential(Vec<(String, Option<&'static str>)>),
    Retries,
    BaseUrl,
    Format,
    ServerVariable(String),
    Parameter(String),
}

/// Every (scheme, field) pair that reads `var`.
///
/// `expand_slots` returns one slot per required value in the same order
/// `scheme_credential_fields` names them, so slot *index* gives the field:
/// `required[0]` is `username`, `required[1]` is `password`. That keeps this
/// generic — nothing here knows what a scheme's halves are called.
fn credential_targets(
    var: &str,
    ctx: &ProfilesContext<'_>,
) -> Vec<(String, Option<&'static str>)> {
    let mut out = Vec::new();
    for (scheme, binding) in ctx.auth_bindings {
        let slots = login::expand_slots(scheme, binding, ctx.login_flows, ctx.cli_name);
        let fields = login::scheme_credential_fields(scheme, ctx.auth_bindings);
        for (index, slot) in slots.required.iter().enumerate() {
            let declares = slot
                .iter()
                .any(|source| matches!(source, AuthCredentialSource::Env(name) if name == var));
            if declares {
                out.push((
                    scheme.clone(),
                    fields.as_ref().and_then(|f| f.get(index).copied()),
                ));
            }
        }
    }
    out
}

/// Classify a key, or explain why it cannot be set.
fn classify_key(key: &str, ctx: &ProfilesContext<'_>) -> Result<SetTarget, CliError> {
    let targets = credential_targets(key, ctx);
    if !targets.is_empty() {
        return Ok(SetTarget::Credential(targets));
    }

    let prefix = format!("{}_", crate::text::env_var_prefix(ctx.cli_name));
    if let Some(rest) = key.strip_prefix(&prefix) {
        match rest {
            "RETRIES" => return Ok(SetTarget::Retries),
            "BASE_URL" => return Ok(SetTarget::BaseUrl),
            "OUTPUT" => return Ok(SetTarget::Format),
            _ => {
                // `<PREFIX>_<SERVER_VAR>` — the env rung a server variable
                // already reads, so the spelling is one the user has seen.
                for variable in &ctx.vocabulary.server_variables {
                    if crate::text::to_screaming_snake(variable) == rest {
                        return Ok(SetTarget::ServerVariable(variable.clone()));
                    }
                }
            }
        }
        // Prefixed but unrecognised. Stop here rather than falling through to
        // the parameter path: `<PREFIX>_…` is unambiguously meant to be one of
        // *this* CLI's environment variables, and that surface is known
        // exhaustively. Falling through would accept a typo on any CLI whose
        // binding cannot enumerate parameters, which is precisely the silent
        // no-op this command is supposed to prevent.
        return Err(unsettable_key(key, ctx));
    }

    if ctx.vocabulary.is_known_parameter(key) {
        return Ok(SetTarget::Parameter(key.to_string()));
    }

    Err(unsettable_key(key, ctx))
}

/// The error for a key this CLI cannot place, with a suggestion when one is
/// close. A silently-ignored key is the failure mode `--set` validation exists
/// to prevent, so `set` refuses rather than storing something inert.
fn unsettable_key(key: &str, ctx: &ProfilesContext<'_>) -> CliError {
    let prefix = crate::text::env_var_prefix(ctx.cli_name);
    let mut known: Vec<String> = Vec::new();
    for (scheme, binding) in ctx.auth_bindings {
        known.extend(login::shadowing_env_vars(ctx.cli_name, scheme, std::slice::from_ref(
            &(scheme.clone(), binding.clone()),
        )));
    }
    for suffix in ["RETRIES", "BASE_URL", "OUTPUT"] {
        known.push(format!("{prefix}_{suffix}"));
    }
    for variable in &ctx.vocabulary.server_variables {
        known.push(format!("{prefix}_{}", crate::text::to_screaming_snake(variable)));
    }
    known.sort();
    known.dedup();

    let suggestion = crate::text::nearest(key, known.iter().cloned())
        .or_else(|| crate::text::nearest(key, ctx.vocabulary.parameter_labels().iter().cloned()))
        .map(|hit| format!(" Did you mean `{hit}`?"))
        .unwrap_or_default();
    CliError::Validation(format!(
        "`{key}` is not something this CLI can store on a profile.{suggestion} \
         Settable environment variables: {}. API parameters are settable by their \
         spec name — run `--schema` to list them.",
        known.join(", "),
    ))
}

fn handle_set(
    matches: &ArgMatches,
    ctx: &ProfilesContext<'_>,
    store: &mut ProfileStore,
) -> Result<(), CliError> {
    let name = matches
        .get_one::<String>("name")
        .cloned()
        .expect("clap marks `name` required");
    validate_profile_name(&name)?;

    let mut entry = store.entry(&name).unwrap_or(ProfileEntry {
        name: name.clone(),
        ..Default::default()
    });
    let existed = store.entry(&name).is_some();

    // Classify everything before writing anything: a run that sets two keys
    // and rejects the third must not leave the first two applied.
    let mut plan: Vec<(String, String, SetTarget)> = Vec::new();
    for raw in matches
        .get_many::<String>("assignments")
        .into_iter()
        .flatten()
    {
        let (key, value) = raw.split_once('=').ok_or_else(|| {
            CliError::Validation(format!(
                "`{raw}` is not a KEY=VALUE assignment. Example: \
                 `{} {} set {name} {}_RETRIES=5`",
                ctx.cli_name,
                ctx.command_name,
                crate::text::env_var_prefix(ctx.cli_name),
            ))
        })?;
        if value.is_empty() {
            return Err(CliError::Validation(format!(
                "`{key}` was given an empty value. To clear a setting, edit \
                 profiles.toml or recreate the profile."
            )));
        }
        plan.push((key.to_string(), value.to_string(), classify_key(key, ctx)?));
    }

    let mut stderr = std::io::stderr();
    let mut notes: Vec<String> = Vec::new();
    let mut credential_schemes: Vec<String> = Vec::new();
    // Multi-field credentials accumulate, so `TWILIO_ACCOUNT_SID=… TWILIO_AUTH_TOKEN=…`
    // in one call produces one complete entry rather than two half-written ones.
    let mut pending: BTreeMap<String, BTreeMap<String, String>> = BTreeMap::new();
    let mut pending_single: BTreeMap<String, String> = BTreeMap::new();

    for (key, value, target) in plan {
        match target {
            SetTarget::Credential(targets) => {
                for (scheme, field) in targets {
                    match field {
                        Some(field) => {
                            pending
                                .entry(scheme.clone())
                                .or_default()
                                .insert(field.to_string(), value.clone());
                        }
                        None => {
                            pending_single.insert(scheme.clone(), value.clone());
                        }
                    }
                    if !credential_schemes.contains(&scheme) {
                        credential_schemes.push(scheme);
                    }
                }
                notes.push(format!("{key} \u{2192} keyring"));
            }
            SetTarget::Retries => {
                let parsed: u32 = value.parse().map_err(|_| {
                    CliError::Validation(format!("`{key}` expects a non-negative integer, got `{value}`"))
                })?;
                entry.retries = Some(parsed);
                notes.push(format!("{key} \u{2192} retries"));
            }
            SetTarget::BaseUrl => {
                crate::output::reject_dangerous_chars(&value, &key)?;
                entry.base_url = Some(value);
                notes.push(format!("{key} \u{2192} base_url"));
            }
            SetTarget::Format => {
                entry.format = Some(value);
                notes.push(format!("{key} \u{2192} format"));
            }
            SetTarget::ServerVariable(variable) => {
                entry.server_variables.insert(variable.clone(), value);
                notes.push(format!("{key} \u{2192} server_variables.{variable}"));
            }
            SetTarget::Parameter(parameter) => {
                ctx.vocabulary.validate_parameter(&parameter, &value)?;
                entry.parameters.insert(parameter.clone(), value);
                notes.push(format!("{key} \u{2192} parameters.{parameter}"));
            }
        }
    }

    // Supplying a credential means this profile owns one — same rule as
    // `create`, and for the same reason: otherwise the write lands in the slot
    // the profile would have *inherited*, overwriting its parent's.
    if !credential_schemes.is_empty() && entry.credential.is_none() {
        entry.credential = Some(name.clone());
    }

    store.upsert(&entry);
    let resolved = store::resolve(store, &name)?;
    let account_owner = resolved.credential.clone().unwrap_or_else(|| name.clone());

    for (scheme, fields) in &pending {
        let account = super::keyring_account_for(scheme, &account_owner);
        // Merge with whatever is already stored so setting one half of a
        // two-field credential does not discard the other.
        let mut merged = existing_fields(ctx.cli_name, &account);
        merged.extend(fields.clone());
        let pairs: Vec<(&str, String)> = merged
            .iter()
            .map(|(field, value)| (field.as_str(), value.clone()))
            .collect();
        let stored = login::multi_field_keyring_value(&pairs)?;
        active_store().set(ctx.cli_name, &account, &stored)?;
    }
    for (scheme, value) in &pending_single {
        let account = super::keyring_account_for(scheme, &account_owner);
        active_store().set(ctx.cli_name, &account, value)?;
    }
    store.save()?;

    let verb = if existed { "Updated" } else { "Created" };
    let _ = writeln!(
        stderr,
        "{}",
        login::green(&format!("\u{2713} {verb} profile `{name}`")),
    );
    for note in &notes {
        let _ = writeln!(stderr, "    {note}");
    }
    if credential_schemes.len() > 1 {
        let _ = writeln!(
            stderr,
            "  Credential stored for {} schemes: {}",
            credential_schemes.len(),
            credential_schemes.join(", "),
        );
    }
    if !credential_schemes.is_empty() {
        let candidates: Vec<String> = credential_schemes
            .iter()
            .flat_map(|scheme| login::shadowing_env_vars(ctx.cli_name, scheme, ctx.auth_bindings))
            .collect();
        login::warn_if_env_shadows(&mut stderr, &candidates);
    }
    Ok(())
}

/// Fields already stored under `account`, so a partial write merges.
fn existing_fields(cli_name: &str, account: &str) -> BTreeMap<String, String> {
    let Ok(Some(raw)) = active_store().get(cli_name, account) else {
        return BTreeMap::new();
    };
    serde_json::from_str::<BTreeMap<String, String>>(&raw).unwrap_or_default()
}

// ── use ─────────────────────────────────────────────────────────────────

fn handle_use(
    matches: &ArgMatches,
    ctx: &ProfilesContext<'_>,
    store: &mut ProfileStore,
) -> Result<(), CliError> {
    let name = matches
        .get_one::<String>("name")
        .cloned()
        .expect("clap marks `name` required");
    let mut stderr = std::io::stderr();

    // `-` clears, mirroring `cd -`-style conventions and giving a way back
    // to unprofiled behaviour without hand-editing the file.
    if name == "-" {
        store.clear_active();
        store.save()?;
        let _ = writeln!(
            stderr,
            "{}",
            login::green("✓ Cleared the active profile."),
        );
        return Ok(());
    }

    if store.entry(&name).is_none() {
        return Err(store::unknown_profile(store, &name));
    }
    // Reject a profile that cannot resolve rather than activating it — a
    // broken `active` pointer makes every subsequent command fail.
    store::resolve(store, &name)?;
    store.set_active(&name);
    store.save()?;
    let _ = writeln!(
        stderr,
        "{}",
        login::green(&format!("✓ Active profile is now `{name}`.")),
    );
    warn_if_env_overrides(&mut stderr, ctx);
    Ok(())
}

/// Warn when `<BIN>_PROFILE` or credential env vars will win over the
/// profile the user just selected — the "I switched but nothing changed"
/// footgun, same shape as `auth login`'s shadow warning (ADR-0008).
fn warn_if_env_overrides<W: Write>(out: &mut W, ctx: &ProfilesContext<'_>) {
    let env_var = selection::profile_env_var(ctx.cli_name);
    if std::env::var(&env_var).is_ok_and(|v| !v.trim().is_empty()) {
        let _ = writeln!(
            out,
            "{}",
            login::yellow(&format!(
                "⚠ Warning: `{env_var}` is set; it selects the profile regardless of \
                 this setting. Unset it to use the active profile."
            )),
        );
        return;
    }
    if env_pseudo_row(ctx).is_some() {
        let _ = writeln!(
            out,
            "{}",
            login::yellow(
                "⚠ Warning: credential environment variables are set; they take \
                 precedence over this profile's stored credential. Run `auth status` \
                 to see which."
            ),
        );
    }
}

// ── remove ──────────────────────────────────────────────────────────────

async fn handle_remove(
    matches: &ArgMatches,
    ctx: &ProfilesContext<'_>,
    store: &mut ProfileStore,
) -> Result<(), CliError> {
    let name = matches
        .get_one::<String>("name")
        .cloned()
        .expect("clap marks `name` required");
    let entry = store
        .entry(&name)
        .ok_or_else(|| store::unknown_profile(store, &name))?;

    // A child that inherits from this profile would be left dangling.
    let dependents: Vec<String> = store
        .entries()
        .into_iter()
        .filter(|other| other.parent.as_deref() == Some(name.as_str()))
        .map(|other| other.name)
        .collect();
    if !dependents.is_empty() {
        return Err(CliError::Validation(format!(
            "profile `{name}` is the parent of {}. Remove or re-parent {} first.",
            dependents.join(", "),
            if dependents.len() == 1 { "it" } else { "them" },
        )));
    }

    let mut stderr = std::io::stderr();
    if !matches.get_flag("yes") {
        // Non-TTY stdin means a script or an agent is driving; prompting
        // there would hang forever (the M17 contract).
        if !std::io::stdin().is_terminal() {
            return Err(CliError::Validation(format!(
                "refusing to remove profile `{name}` without confirmation. \
                 Pass --yes when stdin is not a terminal."
            )));
        }
        let _ = write!(
            stderr,
            "Remove profile `{name}` and its stored credentials? [y/N] ",
        );
        let _ = stderr.flush();
        let mut answer = String::new();
        std::io::BufRead::read_line(&mut std::io::stdin().lock(), &mut answer)
            .map_err(|e| CliError::Other(e.into()))?;
        if !matches!(answer.trim().to_ascii_lowercase().as_str(), "y" | "yes") {
            let _ = writeln!(stderr, "Aborted.");
            return Ok(());
        }
    }

    // Revoke the remote credential *before* touching anything local. A
    // failed revoke then leaves the profile and its stored key intact, so
    // the user can fix the cause and retry — rather than being left with a
    // live remote key and no local record of it.
    if matches.try_get_one::<bool>("revoke").ok().flatten() == Some(&true) {
        revoke_remote_credential(ctx, store, &name).await?;
        let _ = writeln!(
            stderr,
            "{}",
            login::green("✓ Revoked the remote credential."),
        );
    }

    // Resolve before removal so we know which keyring account and token-cache
    // namespace belonged to this profile.
    let credential = store::resolve(store, &name)
        .ok()
        .and_then(|resolved| resolved.credential)
        .unwrap_or_else(|| name.clone());

    // Only purge credentials this profile owned. A profile that borrowed its
    // parent's `credential` must not delete the parent's token on the way
    // out — that would log the user out of the tenant they kept.
    let owns_credential = entry.parent.is_none() || entry.credential.is_some();
    if owns_credential {
        for (scheme, _) in ctx.auth_bindings {
            let account = super::keyring_account_for(scheme, &credential);
            active_store().delete(ctx.cli_name, &account)?;
        }
        if let Some(cache) = crate::auth::TokenCache::for_cli_unprofiled(ctx.cli_name) {
            cache.purge_profile(&credential)?;
        }
    }

    store.remove(&name);
    store.save()?;
    let _ = writeln!(
        stderr,
        "{}",
        login::green(&format!("✓ Removed profile `{name}`.")),
    );
    if !owns_credential {
        let _ = writeln!(
            stderr,
            "  Kept the credential in `{credential}`, which profile `{}` shares.",
            entry.parent.as_deref().unwrap_or("(parent)"),
        );
    }
    Ok(())
}

/// Call the configured revoke operation with the profile's stored parameters.
///
/// The parameters are the profile's own map, which is the only argument
/// source available — the framework has no other way to know which key this
/// profile owns. An operation needing something the profile does not carry
/// fails validation inside the executor with the parameter named, which is
/// the actionable error; storing it is `profiles create --set`'s job.
async fn revoke_remote_credential(
    ctx: &ProfilesContext<'_>,
    store: &ProfileStore,
    name: &str,
) -> Result<(), CliError> {
    let Some(op_path) = ctx.revoke_op_path.as_ref() else {
        return Err(CliError::Validation(
            "--revoke is not configured for this CLI.".to_string(),
        ));
    };
    let resolved = store::resolve(store, name)?;
    let params: serde_json::Map<String, serde_json::Value> = resolved
        .parameters
        .iter()
        .map(|(k, v)| (k.clone(), serde_json::Value::String(v.clone())))
        .collect();
    let params = serde_json::Value::Object(params);

    for binding in ctx.bindings {
        // `Ok(None)` means "not my path" — keep looking, exactly as the
        // `--schema` walk does.
        if binding.invoke_operation(op_path, &params).await?.is_some() {
            return Ok(());
        }
    }
    Err(CliError::Validation(format!(
        "--revoke: no operation `{}` found in this CLI.",
        op_path.join(" "),
    )))
}

// ── current ─────────────────────────────────────────────────────────────

/// The resolved fields of one profile, shared by `current` and `show` so the
/// two cannot drift into reporting different things about the same profile.
fn resolved_profile_fields(
    profile: &store::ResolvedProfile,
    ctx: &ProfilesContext<'_>,
) -> serde_json::Map<String, serde_json::Value> {
    let mut map = serde_json::Map::new();
    map.insert("profile".into(), profile.name.clone().into());
    if let Some(credential) = &profile.credential {
        if let Some(account) = stored_account(ctx, credential) {
            map.insert("account".into(), account.into());
        }
        if credential != &profile.name {
            map.insert("credentials_from".into(), credential.clone().into());
        }
    }
    if let Some(base_url) = &profile.base_url {
        map.insert("base_url".into(), base_url.clone().into());
    }
    if let Some(retries) = profile.retries {
        map.insert("retries".into(), retries.into());
    }
    if let Some(format) = &profile.format {
        map.insert("format".into(), format.clone().into());
    }
    insert_map(&mut map, "parameters", &profile.parameters);
    insert_map(&mut map, "server_variables", &profile.server_variables);
    map
}

/// `profiles show <name>` — inspect a named profile without selecting it.
///
/// `current` answers "what is in effect", which is a different question and
/// takes no name. Inspecting another profile previously meant
/// `-p other profiles current` — "run as if I were on other, then tell me
/// what's current" — which reads backwards and made `-p` look like it was
/// required to name a profile at all. gcloud (`configurations describe NAME`)
/// and kubectl (`get-contexts NAME`) both have the direct form.
///
/// Deliberately omits `selected_by`: nothing selected this profile, and the
/// field only means something for the one actually in effect.
fn handle_show<W: Write>(
    matches: &ArgMatches,
    ctx: &ProfilesContext<'_>,
    store: &ProfileStore,
    out: &mut W,
) -> Result<(), CliError> {
    // The name is optional and falls back to whatever this invocation would
    // select. Requiring it made `-p test_2 profiles show` fail with "required
    // argument NAME", which is a dead end: every other command honours `-p`,
    // so `show` refusing to is an inconsistency inside the CLI rather than a
    // meaningful distinction.
    //
    // Re-resolve from argv rather than reading the installed global, for the
    // same reason `current` does: the `profiles` group is exempt from
    // selection so a stale `active` cannot break the commands that repair it.
    let name = match matches.get_one::<String>("name").cloned() {
        Some(name) => name,
        None => match selection::resolve_selection_in(store, ctx.cli_name, &argv())? {
            Some(selection) => selection.profile.name.clone(),
            None => {
                return Err(CliError::Validation(format!(
                    "no profile selected, so there is nothing to show. Name one \
                     (`{} {} show <name>`), or select one with `-p` or \
                     `{} {} use <name>`.",
                    ctx.cli_name, ctx.command_name, ctx.cli_name, ctx.command_name,
                )));
            }
        },
    };
    if store.entry(&name).is_none() {
        return Err(store::unknown_profile(store, &name));
    }
    let resolved = store::resolve(store, &name)?;

    let pipeline = crate::formatter::OutputPipeline::from_matches(matches, ctx.cli_name)
        .map_err(|e| CliError::Validation(e.to_string()))?;
    let mut map = resolved_profile_fields(&resolved, ctx);
    // Whether this is the profile commands would use by default — the one bit
    // of selection context that is meaningful for a profile you are merely
    // inspecting.
    map.insert("active".into(), (store.active() == Some(name.as_str())).into());

    pipeline
        .emit(out, &serde_json::Value::Object(map), false, true)
        .map_err(|e| CliError::Other(e.into()))?;
    Ok(())
}

fn handle_current<W: Write>(
    matches: &ArgMatches,
    ctx: &ProfilesContext<'_>,
    store: &ProfileStore,
    out: &mut W,
) -> Result<(), CliError> {
    let pipeline = crate::formatter::OutputPipeline::from_matches(matches, ctx.cli_name)
        .map_err(|e| CliError::Validation(e.to_string()))?;

    // Re-resolve rather than reading the installed global: `profiles` is
    // exempted from selection (so `profiles use` still works when `active`
    // is stale), which means the global is empty here.
    let selected = selection::resolve_selection_in(store, ctx.cli_name, &argv())?;

    let payload = match &selected {
        Some(selection) => {
            let profile = &selection.profile;
            let mut map = resolved_profile_fields(profile, ctx);
            // `selected_by`, not `source`: this answers *why* this profile is in
            // play, and the answer changes precedence — only a profile named
            // with the flag outranks credential env vars (`outranks_env`).
            map.insert("selected_by".into(), selection.source.label().into());
            if let Some(env_row) = env_pseudo_row(ctx) {
                // Only claim an *override* when the env vars actually satisfy
                // a scheme. With one half of a two-value credential set, the
                // variable is consulted and does outrank the keyring for that
                // field — but nothing authenticates, so saying "overridden by
                // env" while `auth status` reports `logged_in: false` reads as
                // a contradiction. Report the partial case as partial.
                let key = if env_satisfies_a_scheme(ctx) {
                    "credential_overridden_by_env"
                } else {
                    "credential_partially_shadowed_by_env"
                };
                map.insert(key.into(), env_row["variables"].clone());
            }
            serde_json::Value::Object(map)
        }
        None => serde_json::json!({
            "profile": serde_json::Value::Null,
            "source": "none",
        }),
    };

    if pipeline.format.is_machine_readable() {
        pipeline
            .emit(out, &payload, false, true)
            .map_err(|e| CliError::Other(e.into()))?;
        return Ok(());
    }

    let mut stderr = std::io::stderr();
    match selected {
        Some(_) => {
            pipeline
                .emit(out, &payload, false, true)
                .map_err(|e| CliError::Other(e.into()))?;
        }
        None => {
            let _ = writeln!(
                stderr,
                "No profile selected. Commands run with flags, environment \
                 variables, and spec defaults only.",
            );
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vocabulary() -> Vocabulary {
        let mut vocabulary = Vocabulary {
            server_variables: ["region", "edge"].iter().map(|s| s.to_string()).collect(),
            ..Default::default()
        };
        vocabulary.add_parameters([
            ParameterSpec::unconstrained("AccountSid"),
            ParameterSpec::unconstrained("PageSize"),
            ParameterSpec::with_values(
                "UserType",
                vec!["All".to_string(), "Managed".to_string()],
            ),
        ]);
        vocabulary
    }

    fn create_matches(args: &[&str]) -> ArgMatches {
        let config = ProfilesConfig::default();
        build_profiles_command(&config, &vocabulary())
            .try_get_matches_from(args)
            .expect("args must parse")
            .subcommand_matches("create")
            .expect("create must match")
            .clone()
    }

    // ── [env] row note ──────────────────────────────────────────────────

    /// The note asserts who wins, so it must flip with the selection source.
    /// Saying env "overrides" a profile the request path actually prefers is
    /// the exact wrong turn for someone debugging a precedence surprise.
    #[test]
    #[serial_test::serial]
    fn env_row_note_tracks_selection_source() {
        use crate::auth::test_helpers::GlobalAuthStateGuard;
        use crate::profiles::SelectionSource;

        {
            let mut guard = GlobalAuthStateGuard::new();
            guard.install_profile("prod", SelectionSource::Flag);
            assert!(
                env_row_note().contains("named profile's stored one is preferred"),
                "got: {}",
                env_row_note()
            );
        }
        {
            let mut guard = GlobalAuthStateGuard::new();
            guard.install_profile("prod", SelectionSource::Active);
            assert!(
                env_row_note().contains("overrides the active profile"),
                "got: {}",
                env_row_note()
            );
        }
    }

    // ── name validation ─────────────────────────────────────────────────

    #[test]
    fn reserved_and_malformed_names_are_rejected() {
        for name in ["list", "create", "env", "", "has space", "with#hash", "sl/ash"] {
            assert!(
                validate_profile_name(name).is_err(),
                "`{name}` should be rejected",
            );
        }
    }

    #[test]
    fn ordinary_names_are_accepted() {
        for name in ["prod", "tenant-acme", "au_1", "v1.2"] {
            assert!(validate_profile_name(name).is_ok(), "`{name}` should be accepted");
        }
    }

    // ── KEY=VALUE parsing ───────────────────────────────────────────────

    #[test]
    fn parses_repeated_key_values() {
        let m = create_matches(&[
            "profiles", "create", "p", "--set", "AccountSid=AC11", "--set", "PageSize=10",
        ]);
        let pairs = parse_key_values(&m, "set", "--set").unwrap();
        assert_eq!(
            pairs,
            vec![
                ("AccountSid".to_string(), "AC11".to_string()),
                ("PageSize".to_string(), "10".to_string()),
            ],
        );
    }

    #[test]
    fn a_value_containing_equals_keeps_its_tail() {
        // Base64 and query-string-ish values contain `=`; splitting on the
        // last one would corrupt them.
        let m = create_matches(&["profiles", "create", "p", "--set", "AccountSid=a=b=c"]);
        let pairs = parse_key_values(&m, "set", "--set").unwrap();
        assert_eq!(pairs[0].1, "a=b=c");
    }

    #[test]
    fn a_missing_equals_is_an_error_not_a_silent_skip() {
        let m = create_matches(&["profiles", "create", "p", "--set", "AccountSid"]);
        let err = parse_key_values(&m, "set", "--set").unwrap_err().to_string();
        assert!(err.contains("expected KEY=VALUE"), "{err}");
    }

    #[test]
    fn an_empty_key_is_an_error() {
        let m = create_matches(&["profiles", "create", "p", "--set", "=AC11"]);
        assert!(parse_key_values(&m, "set", "--set").is_err());
    }

    // ── vocabulary validation ───────────────────────────────────────────

    #[test]
    fn a_known_parameter_passes_in_any_spelling() {
        for spelling in ["AccountSid", "account-sid", "account_sid", "ACCOUNTSID"] {
            assert!(
                vocabulary().validate_parameter(spelling, "AC11").is_ok(),
                "`{spelling}` should be accepted",
            );
        }
    }

    #[test]
    fn an_unknown_parameter_is_rejected_with_a_suggestion() {
        // The silent-no-op failure mode this check exists to prevent.
        let err = vocabulary()
            .validate_parameter("AcountSid", "AC11")
            .unwrap_err()
            .to_string();
        assert!(err.contains("no operation accepts"), "{err}");
        assert!(err.contains("Did you mean `AccountSid`?"), "{err}");
    }

    #[test]
    fn an_unknown_parameter_with_no_near_match_still_lists_the_known_ones() {
        let err = vocabulary()
            .validate_parameter("totally-unrelated", "x")
            .unwrap_err()
            .to_string();
        assert!(!err.contains("Did you mean"), "{err}");
        assert!(err.contains("AccountSid"), "{err}");
    }

    #[test]
    fn an_unconstrained_parameter_accepts_any_value() {
        assert!(vocabulary()
            .validate_parameter("AccountSid", "anything at all")
            .is_ok());
    }

    #[test]
    fn a_value_outside_an_enum_is_rejected_at_write_time() {
        // Otherwise the profile stores `admin`, clap installs it as
        // `--user-type`'s default, and *every* command carrying that
        // parameter fails on a flag the caller never passed.
        let err = vocabulary()
            .validate_parameter("UserType", "admin")
            .unwrap_err()
            .to_string();
        assert!(err.contains("not an accepted value"), "{err}");
        assert!(err.contains("All, Managed"), "{err}");
    }

    #[test]
    fn a_near_miss_enum_value_gets_a_suggestion() {
        let err = vocabulary()
            .validate_parameter("UserType", "managed")
            .unwrap_err()
            .to_string();
        assert!(err.contains("Did you mean `Managed`?"), "{err}");
    }

    #[test]
    fn an_enum_value_the_spec_allows_passes() {
        assert!(vocabulary().validate_parameter("UserType", "Managed").is_ok());
    }

    #[test]
    fn allowed_values_union_across_operations() {
        // Two operations constrain the same parameter differently. A value
        // either accepts is legitimate: the profile just does not apply
        // cleanly to both commands.
        let mut vocabulary = Vocabulary::default();
        vocabulary.add_parameters([
            ParameterSpec::with_values("status", vec!["open".to_string()]),
            ParameterSpec::with_values("status", vec!["closed".to_string()]),
        ]);
        assert!(vocabulary.validate_parameter("status", "open").is_ok());
        assert!(vocabulary.validate_parameter("status", "closed").is_ok());
        assert!(vocabulary.validate_parameter("status", "pending").is_err());
    }

    #[test]
    fn an_unconstrained_occurrence_widens_a_constrained_one() {
        // One operation takes `status` as a free string, so no value can be
        // rejected outright.
        let mut vocabulary = Vocabulary::default();
        vocabulary.add_parameters([
            ParameterSpec::with_values("status", vec!["open".to_string()]),
            ParameterSpec::unconstrained("status"),
        ]);
        assert!(vocabulary.validate_parameter("status", "whatever").is_ok());
    }

    #[test]
    fn order_does_not_change_the_widening() {
        let mut vocabulary = Vocabulary::default();
        vocabulary.add_parameters([
            ParameterSpec::unconstrained("status"),
            ParameterSpec::with_values("status", vec!["open".to_string()]),
        ]);
        assert!(vocabulary.validate_parameter("status", "whatever").is_ok());
    }

    #[test]
    fn an_unknown_server_variable_is_rejected() {
        let err = vocabulary()
            .validate_server_variable("regio")
            .unwrap_err()
            .to_string();
        assert!(err.contains("Did you mean `region`?"), "{err}");
    }

    #[test]
    fn an_empty_vocabulary_validates_nothing() {
        // A binding that cannot enumerate its parameters must not make
        // `--set` unusable.
        let empty = Vocabulary::default();
        assert!(empty.validate_parameter("whatever", "anything").is_ok());
        assert!(empty.validate_server_variable("whatever").is_ok());
    }

    // ── command surface ─────────────────────────────────────────────────

    #[test]
    fn create_registers_no_per_server_variable_flag() {
        // Regression guard. Spec server-variable flags are registered on the
        // root with `.global(true)`, and clap copies a global into a
        // subcommand only when the subcommand has no arg with the same *id*.
        // A `create`-local `--region` under the id `server-var:region` is
        // therefore two args sharing one long name, which makes clap reject
        // the whole command tree at startup — so *every* invocation of the
        // binary panics, not just `profiles create`. `handle_create` reads the
        // propagated global instead.
        let vocab = Vocabulary {
            server_variables: ["region", "edge"].iter().map(|s| s.to_string()).collect(),
            ..Default::default()
        };
        let command = build_profiles_command(&ProfilesConfig::default(), &vocab);
        let create = command.find_subcommand("create").expect("create subcommand");
        let longs: Vec<&str> = create.get_arguments().filter_map(|a| a.get_long()).collect();
        assert!(!longs.contains(&"region"), "{longs:?}");
        assert!(!longs.contains(&"edge"), "{longs:?}");
        // The generic form is what `create` owns.
        assert!(longs.contains(&"server-var"), "{longs:?}");
    }

    #[test]
    fn create_does_not_shadow_the_global_format_flag() {
        // `--format` is the output flag on every other command; a `create`
        // arg with the same clap id would shadow it, so
        // `profiles create p --format json` would quietly set the profile's
        // stored format while looking like a request for JSON output.
        let command = build_profiles_command(&ProfilesConfig::default(), &Vocabulary::default());
        let create = command.find_subcommand("create").expect("create subcommand");
        let longs: Vec<&str> = create.get_arguments().filter_map(|a| a.get_long()).collect();
        assert!(!longs.contains(&"format"), "{longs:?}");
        assert!(longs.contains(&"default-format"), "{longs:?}");
    }

    #[test]
    fn with_token_and_from_env_are_mutually_exclusive() {
        let parsed = build_profiles_command(&ProfilesConfig::default(), &vocabulary())
            .try_get_matches_from(["profiles", "create", "p", "--with-token", "--from-env"]);
        assert!(parsed.is_err());
    }

    #[test]
    fn the_group_name_is_configurable() {
        let command = build_profiles_command(
            &ProfilesConfig::default().command_name("tenants"),
            &Vocabulary::default(),
        );
        assert_eq!(command.get_name(), "tenants");
    }

    #[test]
    fn every_builtin_subcommand_is_declared_for_the_fold_gate() {
        // `graft_builtin_command` folds into a spec-owned group of the same
        // name, and dispatch is gated on BUILTIN_SUBCOMMANDS. A leaf missing
        // from that list would be grafted but never reachable.
        let command = build_profiles_command(&ProfilesConfig::default(), &Vocabulary::default());
        for sub in command.get_subcommands() {
            assert!(
                BUILTIN_SUBCOMMANDS.contains(&sub.get_name()),
                "`{}` is not in BUILTIN_SUBCOMMANDS",
                sub.get_name(),
            );
            for alias in sub.get_visible_aliases() {
                assert!(
                    BUILTIN_SUBCOMMANDS.contains(&alias),
                    "alias `{alias}` is not in BUILTIN_SUBCOMMANDS",
                );
            }
        }
    }
}
