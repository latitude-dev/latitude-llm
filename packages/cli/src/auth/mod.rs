//! Authentication provider architecture.
//!
//! Modeled on the Fern TypeScript SDK generator's `core.AuthProvider` contract:
//! every auth scheme implements [`AuthProvider`], which mutates an outgoing
//! [`reqwest::RequestBuilder`] with the appropriate headers. Composition
//! wrappers let multiple schemes coexist:
//!
//! - [`AnyAuthProvider`] — OR semantics. Tries each child provider; the first
//!   that contributes headers wins. Used when a CLI is configured with several
//!   schemes but no per-endpoint security map (the default fallback).
//! - [`RoutingAuthProvider`] — per-endpoint dispatch. Reads the operation's
//!   `security_requirements` (`security: [...]` in OpenAPI), finds the first
//!   requirement that all registered providers can satisfy, and merges their
//!   headers (AND inside a requirement, OR across requirements).
//!
//! Each scheme provider is parameterized by an [`AuthCredentialSource`] — a
//! lazy supplier that resolves a value from an env var, a literal, or a
//! closure. This mirrors the TS generator's `Supplier<T>`.
//!
//! # Module layout
//!
//! - [`credential`] — `AuthCredentialSource` (lazy-supplier model with
//!   env, CLI flag, file, literal, chain, and closure variants).
//! - [`provider`] — the [`AuthProvider`] trait, [`EndpointAuthMetadata`],
//!   [`DynAuthProvider`] alias, and the [`NoAuthProvider`] sentinel.
//! - [`schemes`] — concrete [`BearerAuthProvider`], [`BasicAuthProvider`],
//!   and [`HeaderAuthProvider`] implementations.
//! - [`compose`] — composition wrappers: [`AnyAuthProvider`],
//!   [`AllAuthProvider`], [`LayeredAuthProvider`], [`RoutingAuthProvider`].
//! - [`builder`] — [`SchemeBinding`], [`AuthStrategy`], and the
//!   `build_provider_*` factories that `CliApp` calls.
//! - [`error`] — auth-aware HTTP error mapping (`handle_error_response`).
//!
//! All public types and functions are re-exported at the module root.

pub mod builder;
pub mod compose;
pub mod credential;
pub mod error;
pub mod keyring_store;
pub mod login;
pub mod oauth2;
pub mod oauth_common;
pub mod oauth_login;
pub mod provider;
pub mod root_builder;
pub mod schemes;

#[cfg(test)]
pub(crate) mod test_helpers;

pub use builder::{
    build_provider_from_bindings, build_provider_from_doc, build_provider_with_strategy,
    collect_binding_cli_args, finalize_bindings, render_auth_help_section, render_auth_layers_help,
    AuthStrategy, SchemeBinding,
};
pub use error::handle_error_response;
pub use compose::{AllAuthProvider, AnyAuthProvider, LayeredAuthProvider, RoutingAuthProvider};
pub use credential::AuthCredentialSource;
pub use keyring_store::{
    active_store, auto_store, set_active_store, FileKeyringStore, KeyringStore, MockKeyringStore,
    OsKeyringStore,
};
pub use login::{
    build_auth_command, dispatch_auth, inject_keyring_sources, inject_oauth2_caches,
    run_token_paste, DynLoginFlow, LoginContext, LoginFlow, TokenPasteLoginFlow,
};
pub use oauth_login::{DeviceCodeLoginFlow, OAuth2KeyringProvider, PkceLoginFlow, TokenBundle};
pub use provider::{
    no_auth_provider, AuthProvider, DynAuthProvider, EndpointAuthMetadata, NoAuthProvider,
};
pub use oauth2::{OAuth2Grant, OAuth2TokenProvider, TokenCache};
pub use root_builder::{ApiKeyAuth, AuthSchemeBuilder, BasicAuth, BearerAuth, OAuth2Auth};
pub use schemes::{BasicAuthProvider, BearerAuthProvider, HeaderAuthProvider};
