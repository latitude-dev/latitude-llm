//! Strategy trait for argument defaults.
//!
//! [`ArgSource`] resolves a default value for a CLI flag at runtime.
//! Named implementations cover env vars, files, literals, and chains.

use serde_json::Value;

use crate::binding::BoxFuture;
use crate::error::CliError;

/// Async strategy for resolving a default argument value.
pub trait ArgSource: Send + Sync + 'static {
    /// Resolve the default value. `None` means "no default available."
    fn resolve(&self) -> BoxFuture<'_, Result<Option<Value>, CliError>>;
}

/// Read a trimmed env var. Empty string → `None`.
pub struct EnvArg {
    var: String,
}

impl EnvArg {
    pub fn new(var: impl Into<String>) -> Self {
        Self { var: var.into() }
    }
}

impl ArgSource for EnvArg {
    fn resolve(&self) -> BoxFuture<'_, Result<Option<Value>, CliError>> {
        Box::pin(async move {
            match std::env::var(&self.var) {
                Ok(v) => {
                    let trimmed = v.trim().to_string();
                    if trimmed.is_empty() {
                        Ok(None)
                    } else {
                        Ok(Some(Value::String(trimmed)))
                    }
                }
                Err(_) => Ok(None),
            }
        })
    }
}

/// Read and trim file contents. Missing file → `None`. `~` is expanded
/// against `$HOME`.
pub struct FileArg {
    path: std::path::PathBuf,
}

impl FileArg {
    pub fn new(path: impl Into<std::path::PathBuf>) -> Self {
        Self { path: path.into() }
    }

    fn expand_tilde(path: &std::path::Path) -> std::path::PathBuf {
        if let Ok(stripped) = path.strip_prefix("~") {
            if let Ok(home) = std::env::var("HOME") {
                return std::path::PathBuf::from(home).join(stripped);
            }
        }
        path.to_path_buf()
    }
}

impl ArgSource for FileArg {
    fn resolve(&self) -> BoxFuture<'_, Result<Option<Value>, CliError>> {
        let expanded = Self::expand_tilde(&self.path);
        Box::pin(async move {
            match tokio::fs::read_to_string(&expanded).await {
                Ok(contents) => {
                    let trimmed = contents.trim().to_string();
                    if trimmed.is_empty() {
                        Ok(None)
                    } else {
                        Ok(Some(Value::String(trimmed)))
                    }
                }
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
                Err(e) => Err(CliError::Other(anyhow::anyhow!(
                    "Failed to read {}: {e}",
                    expanded.display()
                ))),
            }
        })
    }
}

/// A baked-in default value.
pub struct LiteralArg {
    value: Value,
}

impl LiteralArg {
    pub fn new(value: impl Into<Value>) -> Self {
        Self {
            value: value.into(),
        }
    }
}

impl ArgSource for LiteralArg {
    fn resolve(&self) -> BoxFuture<'_, Result<Option<Value>, CliError>> {
        let v = self.value.clone();
        Box::pin(async move { Ok(Some(v)) })
    }
}

/// First source returning `Some` wins.
pub struct ChainArg {
    sources: Vec<Box<dyn ArgSource>>,
}

impl ChainArg {
    pub fn from_sources(sources: Vec<Box<dyn ArgSource>>) -> Self {
        Self { sources }
    }
}

impl ArgSource for ChainArg {
    fn resolve(&self) -> BoxFuture<'_, Result<Option<Value>, CliError>> {
        Box::pin(async move {
            for source in &self.sources {
                if let Some(v) = source.resolve().await? {
                    return Ok(Some(v));
                }
            }
            Ok(None)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn env_arg_reads_value() {
        std::env::set_var("TEST_ARG_SOURCE_1", "hello");
        let source = EnvArg::new("TEST_ARG_SOURCE_1");
        let result = source.resolve().await.unwrap();
        assert_eq!(result, Some(Value::String("hello".into())));
        std::env::remove_var("TEST_ARG_SOURCE_1");
    }

    #[tokio::test]
    async fn env_arg_empty_returns_none() {
        std::env::set_var("TEST_ARG_SOURCE_2", "  ");
        let source = EnvArg::new("TEST_ARG_SOURCE_2");
        let result = source.resolve().await.unwrap();
        assert_eq!(result, None);
        std::env::remove_var("TEST_ARG_SOURCE_2");
    }

    #[tokio::test]
    async fn env_arg_missing_returns_none() {
        let source = EnvArg::new("TEST_ARG_SOURCE_DEFINITELY_MISSING");
        let result = source.resolve().await.unwrap();
        assert_eq!(result, None);
    }

    #[tokio::test]
    async fn file_arg_reads_and_trims() {
        let dir = std::env::temp_dir().join("fern_test_arg_source");
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join("test_file.txt");
        std::fs::write(&path, "  world  \n").unwrap();
        let source = FileArg::new(&path);
        let result = source.resolve().await.unwrap();
        assert_eq!(result, Some(Value::String("world".into())));
        let _ = std::fs::remove_file(&path);
    }

    #[tokio::test]
    async fn file_arg_missing_returns_none() {
        let source = FileArg::new("/tmp/fern_test_nonexistent_file_arg_source");
        let result = source.resolve().await.unwrap();
        assert_eq!(result, None);
    }

    #[tokio::test]
    async fn file_arg_empty_returns_none() {
        let dir = std::env::temp_dir().join("fern_test_arg_source");
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join("test_empty_file.txt");
        std::fs::write(&path, "  \n").unwrap();
        let source = FileArg::new(&path);
        let result = source.resolve().await.unwrap();
        assert_eq!(result, None);
        let _ = std::fs::remove_file(&path);
    }

    #[tokio::test]
    async fn literal_arg() {
        let source = LiteralArg::new(42);
        let result = source.resolve().await.unwrap();
        assert_eq!(result, Some(Value::Number(42.into())));
    }

    #[tokio::test]
    async fn chain_arg_first_wins() {
        std::env::set_var("TEST_CHAIN_ARG_1", "from-env");
        let chain = ChainArg::from_sources(vec![
            Box::new(EnvArg::new("TEST_CHAIN_ARG_1")),
            Box::new(LiteralArg::new("fallback")),
        ]);
        let result = chain.resolve().await.unwrap();
        assert_eq!(result, Some(Value::String("from-env".into())));
        std::env::remove_var("TEST_CHAIN_ARG_1");
    }

    #[tokio::test]
    async fn chain_arg_falls_through() {
        let chain = ChainArg::from_sources(vec![
            Box::new(EnvArg::new("TEST_CHAIN_MISSING_ENV")),
            Box::new(LiteralArg::new("fallback")),
        ]);
        let result = chain.resolve().await.unwrap();
        assert_eq!(result, Some(Value::String("fallback".into())));
    }

    #[tokio::test]
    async fn chain_arg_empty_returns_none() {
        let chain = ChainArg::from_sources(vec![]);
        let result = chain.resolve().await.unwrap();
        assert_eq!(result, None);
    }
}
