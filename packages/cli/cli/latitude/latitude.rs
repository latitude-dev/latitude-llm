use std::ffi::OsString;
use std::sync::Arc;

use fern_cli_sdk::app::CliApp;
use fern_cli_sdk::auth::{
    auto_store, set_active_store, BearerAuth, KeyringStore, SchemeBinding, TokenPasteLoginFlow,
};
use fern_cli_sdk::binding::{Binding, BoxFuture, DispatchResult};
use fern_cli_sdk::error::CliError;
use fern_cli_sdk::openapi::OpenApiBinding;

const API_KEY_ENV: &str = "LATITUDE_API_KEY";
const API_KEY_SCHEME: &str = "ApiKeyAuth";
const CLI_NAME: &str = "latitude";
const PROJECT_SLUG_ENV: &str = "LATITUDE_PROJECT_SLUG";
const SANDBOX_ENV: &str = "LATITUDE_SANDBOX";
const SANDBOX_KEY_PREFIX: &str = "lat_sandbox_";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Environment {
    Production,
    Sandbox,
}

impl Environment {
    fn parse(value: &str, source: &str) -> Result<Self, CliError> {
        match value {
            "production" => Ok(Self::Production),
            "sandbox" => Ok(Self::Sandbox),
            _ => Err(CliError::Validation(format!(
                "{source} must be `production` or `sandbox`"
            ))),
        }
    }

    fn from_sandbox_selector(value: Option<&str>) -> Result<Option<Self>, CliError> {
        match value.map(str::trim).filter(|value| !value.is_empty()) {
            None => Ok(None),
            Some("true") => Ok(Some(Self::Sandbox)),
            Some("false") => Ok(Some(Self::Production)),
            Some(_) => Err(CliError::Validation(format!(
                "{SANDBOX_ENV} must be `true` or `false`"
            ))),
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Production => "production",
            Self::Sandbox => "sandbox",
        }
    }

    fn accepts_key(self, value: &str) -> bool {
        match self {
            Self::Production => !value.starts_with(SANDBOX_KEY_PREFIX),
            Self::Sandbox => value.starts_with(SANDBOX_KEY_PREFIX),
        }
    }
}

#[derive(Debug)]
struct EnvironmentStore {
    inner: Arc<dyn KeyringStore>,
    environment: Option<Environment>,
}

impl EnvironmentStore {
    fn new(inner: Arc<dyn KeyringStore>, environment: Option<Environment>) -> Self {
        Self { inner, environment }
    }

    fn scoped_account(&self, account: &str, environment: Environment) -> String {
        format!("{account}:{}", environment.as_str())
    }

    fn matching_legacy_value(
        &self,
        service: &str,
        account: &str,
        environment: Environment,
    ) -> Result<Option<String>, CliError> {
        Ok(self
            .inner
            .get(service, account)?
            .filter(|value| environment.accepts_key(value)))
    }
}

impl KeyringStore for EnvironmentStore {
    fn get(&self, service: &str, account: &str) -> Result<Option<String>, CliError> {
        let Some(environment) = self.environment else {
            return self.inner.get(service, account);
        };
        let scoped_account = self.scoped_account(account, environment);
        match self.inner.get(service, &scoped_account)? {
            Some(value) if environment.accepts_key(&value) => Ok(Some(value)),
            _ => self.matching_legacy_value(service, account, environment),
        }
    }

    fn set(&self, service: &str, account: &str, value: &str) -> Result<(), CliError> {
        let Some(environment) = self.environment else {
            return self.inner.set(service, account, value);
        };
        if !environment.accepts_key(value) {
            return Err(CliError::Auth(format!(
                "This API key is not a {} key. Check the key and rerun `{CLI_NAME} auth login --env {}`.",
                environment.as_str(),
                environment.as_str()
            )));
        }
        self.inner
            .set(service, &self.scoped_account(account, environment), value)
    }

    fn delete(&self, service: &str, account: &str) -> Result<(), CliError> {
        let Some(environment) = self.environment else {
            return self.inner.delete(service, account);
        };
        self.inner
            .delete(service, &self.scoped_account(account, environment))?;
        if self
            .matching_legacy_value(service, account, environment)?
            .is_some()
        {
            self.inner.delete(service, account)?;
        }
        Ok(())
    }

    fn backend_label(&self) -> String {
        match self.environment {
            Some(environment) => format!(
                "{} ({} credential)",
                self.inner.backend_label(),
                environment.as_str()
            ),
            None => self.inner.backend_label(),
        }
    }
}

struct LatitudeBinding(OpenApiBinding);

fn add_project_slug_default(command: clap::Command) -> clap::Command {
    command
        .mut_args(|arg| {
            if arg.get_long() == Some("project-slug") {
                arg.env(PROJECT_SLUG_ENV)
            } else {
                arg
            }
        })
        .mut_subcommands(add_project_slug_default)
}

impl Binding for LatitudeBinding {
    fn name(&self) -> &str {
        self.0.name()
    }

    fn set_cli_name(&mut self, name: &str) {
        self.0.set_cli_name(name);
    }

    fn build_command(&self) -> Result<clap::Command, CliError> {
        self.0.build_command().map(add_project_slug_default)
    }

    fn dispatch<'a>(
        &'a self,
        root_matches: &'a clap::ArgMatches,
        sub_matches: &'a clap::ArgMatches,
        operation_path: &'a [String],
    ) -> BoxFuture<'a, Result<DispatchResult, CliError>> {
        self.0.dispatch(root_matches, sub_matches, operation_path)
    }

    fn spec_document(&self, raw: bool) -> Result<Option<String>, CliError> {
        self.0.spec_document(raw)
    }

    fn schema(&self, path: &[String]) -> Result<Option<serde_json::Value>, CliError> {
        self.0.schema(path)
    }

    fn set_root_auth(&mut self, bindings: &[(String, SchemeBinding)]) {
        self.0.set_root_auth(bindings);
    }

    fn validate_auth(&self) -> Result<(), CliError> {
        self.0.validate_auth()
    }
}

struct PreparedRun {
    args: Vec<OsString>,
    environment: Option<Environment>,
}

fn prepare_run(
    mut args: Vec<OsString>,
    sandbox_selector: Option<&str>,
) -> Result<PreparedRun, CliError> {
    let auth_environment = take_auth_environment(&mut args)?;
    let environment = match auth_environment {
        Some(environment) => Some(environment),
        None => Environment::from_sandbox_selector(sandbox_selector)?,
    };
    Ok(PreparedRun { args, environment })
}

fn subcommand_path(args: &[OsString]) -> Vec<String> {
    let args = args
        .iter()
        .filter_map(|argument| argument.to_str().map(String::from))
        .collect::<Vec<_>>();
    fern_cli_sdk::cli_args::extract_subcommand_path(&args)
}

fn take_auth_environment(args: &mut Vec<OsString>) -> Result<Option<Environment>, CliError> {
    if subcommand_path(args).first().map(String::as_str) != Some("auth") {
        return Ok(None);
    }

    let mut selected = None;
    let mut index = 1;
    while index < args.len() {
        let Some(argument) = args[index].to_str() else {
            index += 1;
            continue;
        };
        let value = if argument == "--env" {
            let value = args
                .get(index + 1)
                .and_then(|value| value.to_str())
                .ok_or_else(|| CliError::Validation("--env requires a value".to_string()))?;
            let value = value.to_string();
            args.drain(index..=index + 1);
            value
        } else if let Some(value) = argument.strip_prefix("--env=") {
            let value = value.to_string();
            args.remove(index);
            value
        } else {
            index += 1;
            continue;
        };

        if selected.is_some() {
            return Err(CliError::Validation(
                "--env may only be specified once".to_string(),
            ));
        }
        selected = Some(Environment::parse(&value, "--env")?);
    }
    Ok(selected)
}

fn is_non_request_command(args: &[OsString]) -> bool {
    let path = subcommand_path(args);
    if path.is_empty() {
        return true;
    }
    if args.iter().any(|argument| {
        matches!(
            argument.to_str(),
            Some("--help" | "-h" | "--version" | "-V" | "--schema" | "--spec" | "--spec-raw")
        )
    }) {
        return true;
    }
    matches!(
        path.first().map(String::as_str),
        Some("auth" | "completion" | "errors" | "generate-skills" | "help" | "man" | "version")
    )
}

fn ensure_selected_credential(
    store: &dyn KeyringStore,
    environment: Option<Environment>,
    args: &[OsString],
) -> Result<(), CliError> {
    let Some(environment) = environment else {
        return Ok(());
    };
    if is_non_request_command(args) {
        return Ok(());
    }
    if store.get(CLI_NAME, API_KEY_SCHEME)?.is_some() {
        return Ok(());
    }
    Err(CliError::Auth(format!(
        "No {} credential is configured. Run `{CLI_NAME} auth login --env {}`.",
        environment.as_str(),
        environment.as_str()
    )))
}

fn build_app(spec: &str, environment: Option<Environment>) -> CliApp {
    let auth = match environment {
        Some(_) => BearerAuth::new(API_KEY_SCHEME),
        None => BearerAuth::new(API_KEY_SCHEME).env(API_KEY_ENV),
    };
    CliApp::new(CLI_NAME)
        .auth(auth)
        .login_flow(TokenPasteLoginFlow::new(API_KEY_SCHEME))
        .binding(LatitudeBinding(OpenApiBinding::new().spec(spec)))
}

pub fn run(spec: &str) -> Result<(), CliError> {
    let _ = dotenvy::dotenv();
    let sandbox_selector = std::env::var(SANDBOX_ENV).ok();
    let prepared = prepare_run(std::env::args_os().collect(), sandbox_selector.as_deref())?;
    if prepared.environment.is_some() {
        // Keep the variable present so CliApp's second dotenv load cannot restore a conflicting key.
        std::env::set_var(API_KEY_ENV, "");
    }
    let store = Arc::new(EnvironmentStore::new(auto_store(), prepared.environment));
    ensure_selected_credential(store.as_ref(), prepared.environment, &prepared.args)?;
    set_active_store(store);
    build_app(spec, prepared.environment).run_with_args(prepared.args);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use fern_cli_sdk::auth::MockKeyringStore;
    use serial_test::serial;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread;

    fn args(values: &[&str]) -> Vec<OsString> {
        values.iter().map(OsString::from).collect()
    }

    fn restore_env(name: &str, value: Option<OsString>) {
        match value {
            Some(value) => std::env::set_var(name, value),
            None => std::env::remove_var(name),
        }
    }

    fn serve_one_request() -> (String, thread::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let handle = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = Vec::new();
            let mut buffer = [0_u8; 4096];
            loop {
                let read = stream.read(&mut buffer).unwrap();
                request.extend_from_slice(&buffer[..read]);
                if read == 0 || request.windows(4).any(|window| window == b"\r\n\r\n") {
                    break;
                }
            }
            let body = b"{}";
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            )
            .unwrap();
            stream.write_all(body).unwrap();
            String::from_utf8(request).unwrap()
        });
        (format!("http://{address}"), handle)
    }

    #[test]
    fn explicit_auth_environment_overrides_sandbox_selector() {
        let prepared = prepare_run(
            args(&["latitude", "auth", "login", "--env", "production"]),
            Some("true"),
        )
        .unwrap();

        assert_eq!(prepared.environment, Some(Environment::Production));
        assert_eq!(prepared.args, args(&["latitude", "auth", "login"]));
    }

    #[test]
    fn invalid_sandbox_selector_is_rejected() {
        let error = prepare_run(args(&["latitude", "projects", "list"]), Some("yes"))
            .err()
            .unwrap();

        assert!(error.to_string().contains("LATITUDE_SANDBOX"));
    }

    #[test]
    fn empty_sandbox_selector_is_treated_as_unset() {
        for value in ["", "   "] {
            let prepared =
                prepare_run(args(&["latitude", "projects", "list"]), Some(value)).unwrap();

            assert_eq!(prepared.environment, None);
        }
    }

    #[test]
    fn auth_environment_is_removed_after_root_global_flags() {
        let prepared = prepare_run(
            args(&[
                "latitude",
                "--base-url",
                "http://localhost:3000",
                "--debug",
                "auth",
                "login",
                "--env",
                "sandbox",
            ]),
            None,
        )
        .unwrap();

        assert_eq!(prepared.environment, Some(Environment::Sandbox));
        assert_eq!(
            prepared.args,
            args(&[
                "latitude",
                "--base-url",
                "http://localhost:3000",
                "--debug",
                "auth",
                "login",
            ])
        );
    }

    #[test]
    fn environment_store_keeps_credentials_separate() {
        let inner = Arc::new(MockKeyringStore::new());
        let production = EnvironmentStore::new(inner.clone(), Some(Environment::Production));
        let sandbox = EnvironmentStore::new(inner, Some(Environment::Sandbox));

        production
            .set(CLI_NAME, API_KEY_SCHEME, "lat_production")
            .unwrap();
        sandbox
            .set(CLI_NAME, API_KEY_SCHEME, "lat_sandbox_development")
            .unwrap();

        assert_eq!(
            production.get(CLI_NAME, API_KEY_SCHEME).unwrap().as_deref(),
            Some("lat_production")
        );
        assert_eq!(
            sandbox.get(CLI_NAME, API_KEY_SCHEME).unwrap().as_deref(),
            Some("lat_sandbox_development")
        );
    }

    #[test]
    fn environment_store_rejects_a_key_for_the_other_environment() {
        let inner = Arc::new(MockKeyringStore::new());
        let sandbox = EnvironmentStore::new(inner.clone(), Some(Environment::Sandbox));
        let production = EnvironmentStore::new(inner, Some(Environment::Production));

        assert!(sandbox
            .set(CLI_NAME, API_KEY_SCHEME, "lat_production")
            .is_err());
        assert!(production
            .set(CLI_NAME, API_KEY_SCHEME, "lat_sandbox_development")
            .is_err());
    }

    #[test]
    fn environment_logout_preserves_the_other_credential() {
        let inner = Arc::new(MockKeyringStore::new());
        let production = EnvironmentStore::new(inner.clone(), Some(Environment::Production));
        let sandbox = EnvironmentStore::new(inner, Some(Environment::Sandbox));
        production
            .set(CLI_NAME, API_KEY_SCHEME, "lat_production")
            .unwrap();
        sandbox
            .set(CLI_NAME, API_KEY_SCHEME, "lat_sandbox_development")
            .unwrap();

        sandbox.delete(CLI_NAME, API_KEY_SCHEME).unwrap();

        assert_eq!(sandbox.get(CLI_NAME, API_KEY_SCHEME).unwrap(), None);
        assert_eq!(
            production.get(CLI_NAME, API_KEY_SCHEME).unwrap().as_deref(),
            Some("lat_production")
        );
    }

    #[test]
    fn matching_legacy_credentials_are_available_to_explicit_selection() {
        let production_inner = Arc::new(MockKeyringStore::new());
        production_inner
            .set(CLI_NAME, API_KEY_SCHEME, "lat_legacy_production")
            .unwrap();
        let production = EnvironmentStore::new(production_inner, Some(Environment::Production));

        let sandbox_inner = Arc::new(MockKeyringStore::new());
        sandbox_inner
            .set(CLI_NAME, API_KEY_SCHEME, "lat_sandbox_legacy")
            .unwrap();
        let sandbox = EnvironmentStore::new(sandbox_inner, Some(Environment::Sandbox));

        assert_eq!(
            production.get(CLI_NAME, API_KEY_SCHEME).unwrap().as_deref(),
            Some("lat_legacy_production")
        );
        assert_eq!(
            sandbox.get(CLI_NAME, API_KEY_SCHEME).unwrap().as_deref(),
            Some("lat_sandbox_legacy")
        );
    }

    #[test]
    fn mismatched_legacy_credential_is_not_used() {
        let inner = Arc::new(MockKeyringStore::new());
        inner
            .set(CLI_NAME, API_KEY_SCHEME, "lat_production")
            .unwrap();
        let sandbox = EnvironmentStore::new(inner, Some(Environment::Sandbox));

        assert_eq!(sandbox.get(CLI_NAME, API_KEY_SCHEME).unwrap(), None);
    }

    #[test]
    fn mismatched_scoped_credential_is_not_used() {
        let inner = Arc::new(MockKeyringStore::new());
        inner
            .set(CLI_NAME, "ApiKeyAuth:sandbox", "lat_production")
            .unwrap();
        let sandbox = EnvironmentStore::new(inner, Some(Environment::Sandbox));

        assert_eq!(sandbox.get(CLI_NAME, API_KEY_SCHEME).unwrap(), None);
    }

    #[test]
    fn selected_environment_requires_its_own_credential() {
        let inner = Arc::new(MockKeyringStore::new());
        let sandbox = EnvironmentStore::new(inner, Some(Environment::Sandbox));
        let command = args(&["latitude", "projects", "list"]);

        let error =
            ensure_selected_credential(&sandbox, Some(Environment::Sandbox), &command).unwrap_err();

        assert!(error
            .to_string()
            .contains("latitude auth login --env sandbox"));
    }

    #[test]
    fn built_in_commands_do_not_require_a_selected_credential() {
        let inner = Arc::new(MockKeyringStore::new());
        let sandbox = EnvironmentStore::new(inner, Some(Environment::Sandbox));

        for command in [
            args(&["latitude", "help", "traces"]),
            args(&["latitude", "version"]),
            args(&["latitude", "-V"]),
            args(&[
                "latitude",
                "--base-url",
                "http://localhost:3000",
                "auth",
                "login",
            ]),
        ] {
            ensure_selected_credential(&sandbox, Some(Environment::Sandbox), &command).unwrap();
        }
    }

    #[test]
    #[serial]
    fn project_slug_environment_default_is_visible_in_help() {
        set_active_store(Arc::new(MockKeyringStore::new()));
        let mut output = Vec::new();
        let exit = build_app(include_str!("openapi0.json"), Some(Environment::Sandbox))
            .try_run_from_with_output(args(&["latitude", "traces", "list", "--help"]), &mut output);
        let output = String::from_utf8(output).unwrap();

        assert_eq!(exit, 0);
        assert!(output.contains(PROJECT_SLUG_ENV));
    }

    #[test]
    #[serial]
    fn sandbox_selection_uses_its_saved_key_and_project_default() {
        let inner = Arc::new(MockKeyringStore::new());
        let sandbox = Arc::new(EnvironmentStore::new(inner, Some(Environment::Sandbox)));
        sandbox
            .set(CLI_NAME, API_KEY_SCHEME, "lat_sandbox_saved")
            .unwrap();
        set_active_store(sandbox);
        let (base_url, request) = serve_one_request();
        let previous_api_key = std::env::var_os(API_KEY_ENV);
        let previous_project_slug = std::env::var_os(PROJECT_SLUG_ENV);
        let previous_base_url = std::env::var_os("LATITUDE_BASE_URL");
        std::env::set_var(API_KEY_ENV, "lat_inherited_production");
        std::env::set_var(PROJECT_SLUG_ENV, "my-app");
        std::env::set_var("LATITUDE_BASE_URL", base_url);

        let mut output = Vec::new();
        let exit = build_app(include_str!("openapi0.json"), Some(Environment::Sandbox))
            .try_run_from_with_output(
                args(&["latitude", "traces", "list", "--format", "json"]),
                &mut output,
            );

        restore_env(API_KEY_ENV, previous_api_key);
        restore_env(PROJECT_SLUG_ENV, previous_project_slug);
        restore_env("LATITUDE_BASE_URL", previous_base_url);
        assert_eq!(exit, 0, "{}", String::from_utf8_lossy(&output));
        let request = request.join().unwrap();
        assert!(
            request.starts_with("POST /v1/projects/my-app/traces/list "),
            "{request}"
        );
        assert!(
            request.contains("authorization: Bearer lat_sandbox_saved\r\n"),
            "{request}"
        );
        assert!(!request.contains("lat_inherited_production"), "{request}");
    }
}
