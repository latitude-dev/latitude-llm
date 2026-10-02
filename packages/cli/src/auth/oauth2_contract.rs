use serde_json::Value;

use crate::auth::oauth_common::read_oauth_env;
use crate::error::CliError;

#[derive(Debug, Clone)]
pub enum OAuth2RequestValue {
    ClientId,
    ClientSecret,
    Scopes,
    ScopesList,
    RefreshToken,
    Literal(Value),
    Env {
        name: String,
        parse_json: bool,
        required: bool,
    },
}

impl OAuth2RequestValue {
    pub fn literal(value: Value) -> Self {
        Self::Literal(value)
    }

    pub fn env(name: impl Into<String>, parse_json: bool) -> Self {
        Self::Env {
            name: name.into(),
            parse_json,
            required: true,
        }
    }

    pub fn optional_env(name: impl Into<String>, parse_json: bool) -> Self {
        Self::Env {
            name: name.into(),
            parse_json,
            required: false,
        }
    }

    pub(crate) fn resolve(
        &self,
        client_id: &str,
        client_secret: &str,
        scopes: &[String],
        refresh_token: Option<&str>,
    ) -> Result<Option<Value>, CliError> {
        match self {
            Self::ClientId => Ok(Some(Value::String(client_id.to_string()))),
            Self::ClientSecret => Ok(Some(Value::String(client_secret.to_string()))),
            Self::Scopes => Ok(Some(Value::String(scopes.join(" ")))),
            Self::ScopesList => Ok(Some(Value::Array(
                scopes
                    .iter()
                    .map(|scope| Value::String(scope.clone()))
                    .collect(),
            ))),
            Self::RefreshToken => refresh_token
                .map(|token| Value::String(token.to_string()))
                .map(Some)
                .ok_or_else(|| CliError::Auth("OAuth2 refresh token is missing".to_string())),
            Self::Literal(value) => Ok(Some(value.clone())),
            Self::Env {
                name,
                parse_json,
                required,
            } => {
                let Some(value) = read_oauth_env(name, *required, "token request")? else {
                    return Ok(None);
                };
                if *parse_json {
                    Ok(Some(
                        serde_json::from_str(&value).unwrap_or_else(|_| Value::String(value)),
                    ))
                } else {
                    Ok(Some(Value::String(value)))
                }
            }
        }
    }

    pub(crate) fn required_env_var(&self) -> Option<&str> {
        match self {
            Self::Env {
                name,
                required: true,
                ..
            } => Some(name),
            _ => None,
        }
    }
}

#[derive(Debug, Clone)]
pub enum OAuth2RequestLocation {
    Body(Vec<String>),
    Query { name: String, allow_multiple: bool },
}

#[derive(Debug, Clone)]
pub struct OAuth2RequestProperty {
    pub(crate) location: OAuth2RequestLocation,
    pub(crate) value: OAuth2RequestValue,
}

impl OAuth2RequestProperty {
    pub fn body<I, S>(path: I, value: OAuth2RequestValue) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        Self {
            location: OAuth2RequestLocation::Body(path.into_iter().map(Into::into).collect()),
            value,
        }
    }

    pub fn query(name: impl Into<String>, value: OAuth2RequestValue) -> Self {
        Self {
            location: OAuth2RequestLocation::Query {
                name: name.into(),
                allow_multiple: false,
            },
            value,
        }
    }

    pub fn query_multiple(name: impl Into<String>, value: OAuth2RequestValue) -> Self {
        Self {
            location: OAuth2RequestLocation::Query {
                name: name.into(),
                allow_multiple: true,
            },
            value,
        }
    }
}

#[derive(Debug, Clone)]
pub(crate) enum OAuth2BodyEncoding {
    None,
    Json(String),
    Form,
}

#[derive(Debug, Clone)]
pub struct OAuth2Endpoint {
    pub(crate) default_url: String,
    pub(crate) path: String,
    pub(crate) method: String,
    pub(crate) use_base_url_override: bool,
    pub(crate) body_encoding: OAuth2BodyEncoding,
    pub(crate) request_properties: Vec<OAuth2RequestProperty>,
    pub(crate) access_token_path: Vec<String>,
    pub(crate) expires_in_path: Option<Vec<String>>,
    pub(crate) refresh_token_path: Option<Vec<String>>,
}

impl OAuth2Endpoint {
    pub fn new(default_url: impl Into<String>, path: impl Into<String>) -> Self {
        Self {
            default_url: default_url.into(),
            path: path.into(),
            method: "POST".to_string(),
            use_base_url_override: false,
            body_encoding: OAuth2BodyEncoding::None,
            request_properties: Vec::new(),
            access_token_path: vec!["access_token".to_string()],
            expires_in_path: None,
            refresh_token_path: None,
        }
    }

    pub fn method(mut self, method: impl Into<String>) -> Self {
        self.method = method.into();
        self
    }

    pub fn use_base_url_override(mut self) -> Self {
        self.use_base_url_override = true;
        self
    }

    pub fn json_body(mut self, content_type: impl Into<String>) -> Self {
        self.body_encoding = OAuth2BodyEncoding::Json(content_type.into());
        self
    }

    pub fn form_body(mut self) -> Self {
        self.body_encoding = OAuth2BodyEncoding::Form;
        self
    }

    pub fn request_property(mut self, property: OAuth2RequestProperty) -> Self {
        self.request_properties.push(property);
        self
    }

    pub fn access_token_path<I, S>(mut self, path: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        self.access_token_path = path.into_iter().map(Into::into).collect();
        self
    }

    pub fn expires_in_path<I, S>(mut self, path: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        self.expires_in_path = Some(path.into_iter().map(Into::into).collect());
        self
    }

    pub fn refresh_token_path<I, S>(mut self, path: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        self.refresh_token_path = Some(path.into_iter().map(Into::into).collect());
        self
    }

    pub(crate) fn resolve_url(&self, base_url_override: Option<&str>) -> String {
        if self.use_base_url_override {
            if let Some(base_url) = base_url_override {
                return join_url(base_url, &self.path);
            }
        }
        self.default_url.clone()
    }

    pub(crate) fn required_env_vars(&self) -> impl Iterator<Item = &str> {
        self.request_properties
            .iter()
            .filter_map(|property| property.value.required_env_var())
    }
}

fn join_url(base_url: &str, path: &str) -> String {
    format!(
        "{}/{}",
        base_url.trim_end_matches('/'),
        path.trim_start_matches('/')
    )
}
