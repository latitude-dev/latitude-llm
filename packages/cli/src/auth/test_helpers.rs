//! Shared test fixtures used across the `auth` submodules. Compiled only
//! under `#[cfg(test)]`.

use std::sync::Arc;

use crate::auth::credential::AuthCredentialSource;
use crate::auth::provider::DynAuthProvider;
use crate::auth::schemes::{BearerAuthProvider, HeaderAuthProvider};

/// A bare `RequestBuilder` pointing at example.com. Tests only inspect the
/// resulting headers — the URL doesn't matter.
pub fn req() -> reqwest::RequestBuilder {
    reqwest::Client::new().post("https://example.com/")
}

/// Read the `Authorization` header back off a built request, if present.
pub fn auth_header(req: reqwest::RequestBuilder) -> Option<String> {
    let built = req.build().unwrap();
    built
        .headers()
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .map(str::to_string)
}

/// Read an arbitrary header value back off a built request.
pub fn header(req: reqwest::RequestBuilder, name: &str) -> Option<String> {
    let built = req.build().unwrap();
    built
        .headers()
        .get(name)
        .and_then(|v| v.to_str().ok())
        .map(str::to_string)
}

/// Pre-built bearer provider with a literal token. Used as a fixture
/// for tests that need a credential-bearing provider.
pub fn bearer(name: &str, token: &str) -> DynAuthProvider {
    Arc::new(BearerAuthProvider::new(
        name,
        AuthCredentialSource::literal(token),
    ))
}

/// Pre-built header provider — convenience for the apiKey-style tests.
pub fn api_key(name: &str, header_name: &str, value: &str) -> DynAuthProvider {
    Arc::new(HeaderAuthProvider::new(
        name,
        header_name,
        AuthCredentialSource::literal(value),
        false,
    ))
}
