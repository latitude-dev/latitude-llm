//! SDK execution bridge — implements the generated SDK's `RequestExecutor`
//! trait by routing through the CLI's existing HTTP/auth/retry stack.
//!
//! The [`CliExecutor`] struct holds references to the CLI's [`HttpConfig`],
//! [`DynAuthProvider`], global headers, and base-URL override. Its
//! [`execute`](CliExecutor::execute) method guarantees on-the-wire behavioral
//! parity with built-in commands:
//!
//! * Same TLS roots / proxy / timeouts (`HttpConfig::build_client`)
//! * Same auth application (`DynAuthProvider::apply`)
//! * Same retry logic ([`decide_retry`](crate::openapi::executor::decide_retry))
//! * Same global-header injection
//!
//! **ADR-0001 compliant**: credentials stay inside `auth_provider.apply()` —
//! the executor never extracts or exposes resolved credentials.
//!
//! # Usage
//!
//! The generated CLI (FER-11028) will construct a `CliExecutor` from the
//! runtime `AppContext` and wrap it in `Arc<dyn RequestExecutor>` for the
//! co-vendored SDK crate's `HttpClient::with_executor()`.

use std::future::Future;
use std::pin::Pin;

use reqwest::{Client, Request, Response};

use crate::auth::{DynAuthProvider, EndpointAuthMetadata};
use crate::error::CliError;
use crate::http::HttpConfig;
use crate::openapi::discovery::RetriesConfig;
use crate::openapi::executor::{decide_retry, RetryOutcome};

// ---------------------------------------------------------------------------
// Trait mirror — matches the SDK's `RequestExecutor` signature exactly.
// ---------------------------------------------------------------------------

/// Mirror of the generated SDK's `RequestExecutor` trait.
///
/// Defined here so the cli-sdk can implement and test the executor without
/// depending on a generated crate. The CLI generator (FER-11028) emits a
/// thin adapter that bridges this implementation to the SDK's concrete trait.
///
/// The error type is [`SdkError`] rather than `reqwest::Error` so that
/// pre-send failures (auth, validation) can be surfaced without sending
/// an unauthenticated request.
pub trait SdkRequestExecutor: Send + Sync {
    /// Execute a fully-built HTTP request through the CLI's transport stack.
    fn execute(
        &self,
        request: Request,
    ) -> Pin<Box<dyn Future<Output = Result<Response, SdkError>> + Send + '_>>;
}

// ---------------------------------------------------------------------------
// CliExecutor — the concrete implementation
// ---------------------------------------------------------------------------

/// Executes SDK-originated HTTP requests through the CLI's transport stack.
///
/// Constructed once per CLI invocation and shared (via `Arc`) across all SDK
/// client instances within that process. The `reqwest::Client` is built once
/// at construction time and reused across all requests for connection pooling.
pub struct CliExecutor {
    client: Client,
    auth_provider: DynAuthProvider,
    global_headers: Vec<(String, String)>,
    base_url_override: Option<String>,
    retries: RetriesConfig,
}

impl CliExecutor {
    /// Create a new executor wired to the CLI's runtime context.
    ///
    /// # Panics
    ///
    /// Panics if `HttpConfig::build_client()` fails (invalid TLS config, etc.).
    /// This surfaces errors at construction time rather than per-request.
    pub fn new(
        http_config: HttpConfig,
        auth_provider: DynAuthProvider,
        global_headers: Vec<(String, String)>,
        base_url_override: Option<String>,
    ) -> Self {
        let client = http_config
            .build_client()
            .expect("HttpConfig::build_client failed");
        Self {
            client,
            auth_provider,
            global_headers,
            base_url_override,
            retries: RetriesConfig::default(),
        }
    }

    /// Override the default retry configuration.
    pub fn with_retries(mut self, retries: RetriesConfig) -> Self {
        self.retries = retries;
        self
    }

    /// Execute a single request with auth, global headers, and retries.
    ///
    /// The incoming `Request` from the SDK contains the endpoint URL, HTTP
    /// method, body, and any user-set headers. This method:
    /// 1. Decomposes the request into a `RequestBuilder`
    /// 2. Applies auth via `auth_provider.apply()`
    /// 3. Applies global headers
    /// 4. Optionally overrides the base URL
    /// 5. Sends with retry logic (reusing the pooled `Client`)
    async fn execute_inner(&self, request: Request) -> Result<Response, SdkError> {
        let client = &self.client;

        let method = request.method().clone();
        let url = self.resolve_url(request.url().clone());
        let headers = request.headers().clone();
        // Capture body bytes for retry support. SDK requests are typically
        // small JSON payloads so buffering is acceptable.
        let body_bytes: Option<bytes::Bytes> = request.body().map(|b| {
            b.as_bytes()
                .map(bytes::Bytes::copy_from_slice)
                .expect(
                    "CliExecutor does not support streaming request bodies; \
                     SDK requests must be fully buffered",
                )
        });

        let http_method_str = method.as_str().to_uppercase();

        let mut retry_attempt: u32 = 0;
        loop {
            let builder =
                self.build_request(client, &method, &url, &headers, body_bytes.as_ref())?;

            let resp = match builder.send().await {
                Ok(resp) => {
                    let status = resp.status().as_u16();
                    let retry_after = resp
                        .headers()
                        .get("retry-after")
                        .and_then(|v| v.to_str().ok())
                        .map(|s| s.to_string());
                    let outcome = RetryOutcome {
                        status: Some(status),
                        retry_after: retry_after.as_deref(),
                    };
                    if let Some(delay) = decide_retry(
                        retry_attempt,
                        &outcome,
                        &self.retries,
                        &http_method_str,
                        true, // SDK requests are treated as idempotent
                        false,
                    ) {
                        retry_attempt += 1;
                        tokio::time::sleep(delay).await;
                        continue;
                    }
                    resp
                }
                Err(e) => {
                    let outcome = RetryOutcome {
                        status: None,
                        retry_after: None,
                    };
                    if let Some(delay) = decide_retry(
                        retry_attempt,
                        &outcome,
                        &self.retries,
                        &http_method_str,
                        true,
                        false,
                    ) {
                        retry_attempt += 1;
                        tokio::time::sleep(delay).await;
                        continue;
                    }
                    return Err(SdkError::from(e));
                }
            };

            return Ok(resp);
        }
    }

    /// Decompose parts back into a `RequestBuilder`, apply auth and headers.
    ///
    /// Returns `Err` if the auth provider fails — the caller must NOT
    /// fall back to sending without credentials (fail-closed, consistent
    /// with `build_http_request` in `openapi/executor.rs` and
    /// `graphql/executor.rs`).
    fn build_request(
        &self,
        client: &Client,
        method: &reqwest::Method,
        url: &reqwest::Url,
        headers: &reqwest::header::HeaderMap,
        body_bytes: Option<&bytes::Bytes>,
    ) -> Result<reqwest::RequestBuilder, SdkError> {
        let mut builder = client.request(method.clone(), url.clone());
        for (name, value) in headers.iter() {
            builder = builder.header(name, value);
        }
        if let Some(body) = body_bytes {
            builder = builder.body(body.clone());
        }

        // Apply auth — ADR-0001: credentials stay inside apply().
        // Fail closed: if the provider returns an error, we surface it
        // rather than silently sending without credentials.
        let endpoint = EndpointAuthMetadata::unspecified();
        builder = match self.auth_provider.apply(builder, &endpoint) {
            Ok(b) => b,
            Err(e) => {
                tracing::warn!(
                    "CLI auth provider failed during SDK request execution; \
                     request will NOT be sent: {e}"
                );
                return Err(SdkError::Auth(format!(
                    "CLI auth failed: {e}"
                )));
            }
        };

        // Apply global headers (lower precedence than per-request headers
        // already set by the SDK, but reqwest appends rather than replaces
        // for duplicate names — auth headers win because they're set first).
        for (name, value) in &self.global_headers {
            builder = builder.header(name.as_str(), value.as_str());
        }

        Ok(builder)
    }

    /// Resolve the final URL, applying base-URL override if configured.
    ///
    /// Replaces scheme + host + port from the override. If the override has a
    /// non-root path (e.g. `http://localhost:8080/api/v2`), that path is
    /// prepended to the original request path so that a request to
    /// `https://api.example.com/users` becomes `http://localhost:8080/api/v2/users`.
    ///
    /// Note: The generated glue (FER-11028) typically sets the SDK's own
    /// `base_url` to the override, so this method acts as a safety net for
    /// cases where the SDK was constructed without the override.
    fn resolve_url(&self, mut url: reqwest::Url) -> reqwest::Url {
        if let Some(ref override_base) = self.base_url_override {
            if let Ok(base) = reqwest::Url::parse(override_base) {
                url.set_scheme(base.scheme()).ok();
                if let Some(host) = base.host_str() {
                    url.set_host(Some(host)).ok();
                }
                url.set_port(base.port()).ok();
                let base_path = base.path().trim_end_matches('/');
                if !base_path.is_empty() && base_path != "/" {
                    let original_path = url.path().to_string();
                    url.set_path(&format!("{}{}", base_path, original_path));
                }
            }
        }
        url
    }
}

impl SdkRequestExecutor for CliExecutor {
    fn execute(
        &self,
        request: Request,
    ) -> Pin<Box<dyn Future<Output = Result<Response, SdkError>> + Send + '_>> {
        Box::pin(self.execute_inner(request))
    }
}

// ---------------------------------------------------------------------------
// block_on helper
// ---------------------------------------------------------------------------

/// Execute an async SDK operation from synchronous custom-command context.
///
/// Uses the existing pattern: `block_in_place` parks the current tokio
/// worker thread so a nested `block_on` is legal. Converts the SDK's
/// error type into [`CliError`] via the error bridge.
///
/// # Panics
///
/// Panics if called outside a tokio runtime (should never happen — CLI
/// binaries always run inside `#[tokio::main]`).
pub fn block_on<F, T, E>(future: F) -> Result<T, CliError>
where
    F: Future<Output = Result<T, E>>,
    E: Into<SdkError>,
{
    tokio::task::block_in_place(|| {
        let handle = tokio::runtime::Handle::current();
        handle.block_on(future).map_err(|e| e.into().into_cli_error())
    })
}

// ---------------------------------------------------------------------------
// Error bridge: SdkError → CliError
// ---------------------------------------------------------------------------

/// Wrapper around errors originating from the generated SDK.
///
/// The generated SDK uses `ApiError` with variants for HTTP status, network,
/// and timeout errors. This struct provides a uniform bridge to [`CliError`].
#[derive(Debug)]
pub enum SdkError {
    /// HTTP response with a non-success status code.
    Http {
        status: u16,
        body: String,
    },
    /// Network-level failure (DNS, connection refused, TLS handshake, etc.).
    Network(String),
    /// Request timed out.
    Timeout(String),
    /// Authentication failure (credential resolution, token refresh, etc.).
    Auth(String),
    /// Any other SDK error.
    Other(String),
}

impl SdkError {
    /// Convert into the CLI's native error type.
    pub fn into_cli_error(self) -> CliError {
        match self {
            Self::Http { status, body } => CliError::Api {
                code: status,
                message: body,
                reason: http_status_reason(status).to_string(),
            },
            Self::Network(msg) => {
                CliError::Other(anyhow::anyhow!("SDK network error: {msg}"))
            }
            Self::Timeout(msg) => {
                CliError::Other(anyhow::anyhow!("SDK request timeout: {msg}"))
            }
            Self::Auth(msg) => CliError::Auth(msg),
            Self::Other(msg) => {
                CliError::Other(anyhow::anyhow!("SDK error: {msg}"))
            }
        }
    }
}

impl std::fmt::Display for SdkError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Http { status, body } => write!(f, "HTTP error {status}: {body}"),
            Self::Network(msg) => write!(f, "network error: {msg}"),
            Self::Timeout(msg) => write!(f, "request timeout: {msg}"),
            Self::Auth(msg) => write!(f, "authentication error: {msg}"),
            Self::Other(msg) => write!(f, "SDK error: {msg}"),
        }
    }
}

impl std::error::Error for SdkError {}

impl From<reqwest::Error> for SdkError {
    fn from(e: reqwest::Error) -> Self {
        if e.is_timeout() {
            Self::Timeout(e.to_string())
        } else if e.is_connect() || e.is_redirect() {
            Self::Network(e.to_string())
        } else if let Some(status) = e.status() {
            Self::Http {
                status: status.as_u16(),
                body: e.to_string(),
            }
        } else {
            Self::Network(e.to_string())
        }
    }
}

/// Map an HTTP status code to a short reason string for [`CliError::Api`].
fn http_status_reason(status: u16) -> &'static str {
    match status {
        400 => "badRequest",
        401 => "unauthorized",
        403 => "forbidden",
        404 => "notFound",
        408 => "requestTimeout",
        409 => "conflict",
        422 => "unprocessableEntity",
        429 => "rateLimited",
        500 => "internalServerError",
        502 => "badGateway",
        503 => "serviceUnavailable",
        504 => "gatewayTimeout",
        _ => "httpError",
    }
}



#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use crate::auth::{no_auth_provider, AuthProvider, EndpointAuthMetadata};

    /// Auth provider that always returns a hard error.
    #[derive(Debug)]
    struct FailingAuthProvider;

    impl AuthProvider for FailingAuthProvider {
        fn name(&self) -> &str {
            "failing-test"
        }

        fn has_credentials(&self) -> bool {
            true
        }

        fn apply(
            &self,
            _request: reqwest::RequestBuilder,
            _endpoint: &EndpointAuthMetadata,
        ) -> Result<reqwest::RequestBuilder, CliError> {
            Err(CliError::Auth("token refresh failed".into()))
        }
    }

    fn failing_auth_provider() -> DynAuthProvider {
        Arc::new(FailingAuthProvider)
    }

    #[test]
    fn sdk_error_auth_maps_to_cli_auth() {
        let err = SdkError::Auth("token refresh failed".into());
        let cli_err = err.into_cli_error();
        assert_eq!(cli_err.exit_code(), CliError::EXIT_CODE_AUTH);
        match cli_err {
            CliError::Auth(msg) => {
                assert!(msg.contains("token refresh failed"));
            }
            _ => panic!("expected CliError::Auth, got: {cli_err:?}"),
        }
    }

    #[test]
    fn sdk_error_http_maps_to_cli_api() {
        let err = SdkError::Http {
            status: 404,
            body: "not found".into(),
        };
        let cli_err = err.into_cli_error();
        match cli_err {
            CliError::Api { code, message, reason } => {
                assert_eq!(code, 404);
                assert_eq!(message, "not found");
                assert_eq!(reason, "notFound");
            }
            _ => panic!("expected CliError::Api"),
        }
    }

    #[test]
    fn sdk_error_network_maps_to_cli_other() {
        let err = SdkError::Network("connection refused".into());
        let cli_err = err.into_cli_error();
        assert!(matches!(cli_err, CliError::Other(_)));
        assert!(cli_err.to_string().contains("network error"));
    }

    #[test]
    fn sdk_error_timeout_maps_to_cli_other() {
        let err = SdkError::Timeout("timed out after 30s".into());
        let cli_err = err.into_cli_error();
        assert!(matches!(cli_err, CliError::Other(_)));
        assert!(cli_err.to_string().contains("timeout"));
    }

    #[test]
    fn sdk_error_display_formats() {
        assert_eq!(
            SdkError::Http { status: 404, body: "not found".into() }.to_string(),
            "HTTP error 404: not found"
        );
        assert_eq!(
            SdkError::Network("connection refused".into()).to_string(),
            "network error: connection refused"
        );
        assert_eq!(
            SdkError::Timeout("after 30s".into()).to_string(),
            "request timeout: after 30s"
        );
        assert_eq!(
            SdkError::Auth("bad token".into()).to_string(),
            "authentication error: bad token"
        );
        assert_eq!(
            SdkError::Other("unknown".into()).to_string(),
            "SDK error: unknown"
        );
    }

    #[test]
    fn sdk_error_implements_std_error() {
        let err: Box<dyn std::error::Error + Send + Sync> =
            Box::new(SdkError::Network("test".into()));
        let downcast = err.downcast::<SdkError>();
        assert!(downcast.is_ok());
        assert!(matches!(*downcast.unwrap(), SdkError::Network(_)));
    }

    #[test]
    fn http_status_reason_known_codes() {
        assert_eq!(http_status_reason(401), "unauthorized");
        assert_eq!(http_status_reason(429), "rateLimited");
        assert_eq!(http_status_reason(503), "serviceUnavailable");
        assert_eq!(http_status_reason(999), "httpError");
    }

    #[test]
    fn cli_executor_new_default_retries() {
        let http = HttpConfig::new("test-cli").unwrap();
        let executor = CliExecutor::new(
            http,
            no_auth_provider(),
            vec![],
            None,
        );
        assert!(executor.retries.enabled);
        assert!(executor.retries.max_attempts > 0);
    }

    #[test]
    fn cli_executor_with_retries_override() {
        let http = HttpConfig::new("test-cli").unwrap();
        let custom = RetriesConfig {
            enabled: false,
            ..Default::default()
        };
        let executor = CliExecutor::new(
            http,
            no_auth_provider(),
            vec![],
            None,
        )
        .with_retries(custom);
        assert!(!executor.retries.enabled);
    }

    #[test]
    fn resolve_url_no_override() {
        let http = HttpConfig::new("test-cli").unwrap();
        let executor = CliExecutor::new(http, no_auth_provider(), vec![], None);
        let url = reqwest::Url::parse("https://api.example.com/v1/users").unwrap();
        let resolved = executor.resolve_url(url.clone());
        assert_eq!(resolved, url);
    }

    #[test]
    fn resolve_url_with_override() {
        let http = HttpConfig::new("test-cli").unwrap();
        let executor = CliExecutor::new(
            http,
            no_auth_provider(),
            vec![],
            Some("http://localhost:8080".into()),
        );
        let url = reqwest::Url::parse("https://api.example.com/v1/users?page=1").unwrap();
        let resolved = executor.resolve_url(url);
        assert_eq!(resolved.scheme(), "http");
        assert_eq!(resolved.host_str(), Some("localhost"));
        assert_eq!(resolved.port(), Some(8080));
        assert_eq!(resolved.path(), "/v1/users");
        assert_eq!(resolved.query(), Some("page=1"));
    }

    #[test]
    fn resolve_url_with_path_bearing_override() {
        let http = HttpConfig::new("test-cli").unwrap();
        let executor = CliExecutor::new(
            http,
            no_auth_provider(),
            vec![],
            Some("http://localhost:8080/api/v2".into()),
        );
        let url = reqwest::Url::parse("https://api.example.com/users?page=1").unwrap();
        let resolved = executor.resolve_url(url);
        assert_eq!(resolved.scheme(), "http");
        assert_eq!(resolved.host_str(), Some("localhost"));
        assert_eq!(resolved.port(), Some(8080));
        assert_eq!(resolved.path(), "/api/v2/users");
        assert_eq!(resolved.query(), Some("page=1"));
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn block_on_converts_sdk_error() {
        let result: Result<(), CliError> = block_on(async {
            Err::<(), SdkError>(SdkError::Http {
                status: 500,
                body: "internal error".into(),
            })
        });
        assert!(result.is_err());
        let err = result.unwrap_err();
        match err {
            CliError::Api { code, .. } => assert_eq!(code, 500),
            _ => panic!("expected CliError::Api"),
        }
    }

    #[tokio::test]
    async fn execute_applies_global_headers() {
        // Use wiremock to verify headers are applied
        let mock_server = wiremock::MockServer::start().await;
        wiremock::Mock::given(wiremock::matchers::method("GET"))
            .and(wiremock::matchers::header("X-Custom", "value"))
            .respond_with(wiremock::ResponseTemplate::new(200).set_body_string("ok"))
            .mount(&mock_server)
            .await;

        let http = HttpConfig::new("test-cli").unwrap();
        let executor = CliExecutor::new(
            http,
            no_auth_provider(),
            vec![("X-Custom".into(), "value".into())],
            None,
        );

        let client = reqwest::Client::new();
        let request = client
            .get(format!("{}/test", mock_server.uri()))
            .build()
            .unwrap();

        let resp = executor.execute_inner(request).await.unwrap();
        assert_eq!(resp.status().as_u16(), 200);
    }

    #[tokio::test]
    async fn execute_applies_base_url_override() {
        let mock_server = wiremock::MockServer::start().await;
        wiremock::Mock::given(wiremock::matchers::method("GET"))
            .and(wiremock::matchers::path("/v1/data"))
            .respond_with(wiremock::ResponseTemplate::new(200).set_body_string("overridden"))
            .mount(&mock_server)
            .await;

        let http = HttpConfig::new("test-cli").unwrap();
        let executor = CliExecutor::new(
            http,
            no_auth_provider(),
            vec![],
            Some(mock_server.uri()),
        );

        let client = reqwest::Client::new();
        // Build request against original host — override should redirect
        let request = client
            .get("https://api.example.com/v1/data")
            .build()
            .unwrap();

        let resp = executor.execute_inner(request).await.unwrap();
        assert_eq!(resp.status().as_u16(), 200);
        let text = resp.text().await.unwrap();
        assert_eq!(text, "overridden");
    }

    #[tokio::test]
    async fn execute_retries_on_500() {
        use std::sync::atomic::{AtomicU32, Ordering};

        let mock_server = wiremock::MockServer::start().await;
        let call_count = Arc::new(AtomicU32::new(0));
        let cc = call_count.clone();

        wiremock::Mock::given(wiremock::matchers::method("GET"))
            .respond_with(move |_req: &wiremock::Request| {
                let n = cc.fetch_add(1, Ordering::SeqCst);
                if n == 0 {
                    wiremock::ResponseTemplate::new(500)
                } else {
                    wiremock::ResponseTemplate::new(200)
                        .set_body_string("success")
                }
            })
            .mount(&mock_server)
            .await;

        let http = HttpConfig::new("test-cli").unwrap();
        let retries = RetriesConfig {
            enabled: true,
            max_attempts: 3,
            base_delay_ms: 10, // short for tests
            factor: 1.0,
            jitter: 0.0,
        };
        let executor = CliExecutor::new(http, no_auth_provider(), vec![], None)
            .with_retries(retries);

        let client = reqwest::Client::new();
        let request = client
            .get(format!("{}/retry-test", mock_server.uri()))
            .build()
            .unwrap();

        let resp = executor.execute_inner(request).await.unwrap();
        assert_eq!(resp.status().as_u16(), 200);
        assert!(call_count.load(Ordering::SeqCst) >= 2);
    }

    #[tokio::test]
    async fn execute_fails_closed_on_auth_error() {
        let mock_server = wiremock::MockServer::start().await;
        wiremock::Mock::given(wiremock::matchers::method("GET"))
            .respond_with(wiremock::ResponseTemplate::new(200))
            .expect(0) // must NOT receive any request
            .mount(&mock_server)
            .await;

        let http = HttpConfig::new("test-cli").unwrap();
        let executor = CliExecutor::new(
            http,
            failing_auth_provider(),
            vec![],
            None,
        );

        let client = reqwest::Client::new();
        let request = client
            .get(format!("{}/should-not-be-sent", mock_server.uri()))
            .build()
            .unwrap();

        let result = executor.execute_inner(request).await;
        assert!(result.is_err(), "expected auth failure to propagate as error");
        let err_msg = match &result.unwrap_err() {
            SdkError::Auth(msg) => msg.clone(),
            other => panic!("expected SdkError::Auth, got: {other:?}"),
        };
        assert!(
            err_msg.contains("auth"),
            "error should mention auth: {err_msg}"
        );
        // wiremock's expect(0) will panic on drop if any request was received,
        // verifying the request was never sent (fail-closed).
    }
}
