// SPDX-License-Identifier: Apache-2.0

//! Output Formatting
//!
//! Transforms JSON API responses into human-readable formats (table, YAML, CSV).

use serde_json::Value;
use std::fmt::Write;
use std::io::IsTerminal;

/// Color emission mode.
///
/// Resolved from CLI flags and environment in [`OutputPipeline::from_matches`].
/// `Auto` means "let the resolver decide based on TTY / `NO_COLOR` / `CI` / etc."
/// (Resolver is implemented in Step 2; for now `Auto` is just stored.)
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub enum ColorMode {
    #[default]
    Auto,
    Always,
    Never,
}

/// Errors that can occur while constructing or running the output pipeline.
#[derive(Debug, thiserror::Error)]
pub enum FormatError {
    #[error("unknown output format: {0}")]
    UnknownFormat(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("invalid --query expression: {0}")]
    InvalidQuery(String),
    #[error("--query evaluation failed: {0}")]
    QueryEvaluation(String),
}

/// Composable output pipeline.
///
/// Built once at dispatch time from CLI matches, then threaded through the
/// executor and applied per response (or per page during `--page-all`).
///
/// In Step 1 it carries only `format` and `color_mode` and behaves identically
/// to the prior `&OutputFormat` threading. Later steps layer in field
/// projection, jq filtering, and template rendering.
#[derive(Debug, Clone, Default)]
pub struct OutputPipeline {
    pub format: OutputFormat,
    pub color_mode: ColorMode,
    /// When true, suppress all stdout output. Errors still flow to stderr.
    pub quiet: bool,
    /// Optional JMESPath expression applied to every response before formatting.
    pub query: Option<String>,
}

impl OutputPipeline {
    /// Build a pipeline from parsed CLI matches.
    ///
    /// Resolves the output format with this precedence when `--format` is
    /// **not** passed:
    ///   1. an explicit `--format` flag (always wins);
    ///   2. the per-binary `<NAME>_OUTPUT` env var, if set to a valid format
    ///      (`NAME` is `app_name` uppercased with `-` → `_`, mirroring the
    ///      `<NAME>_LOG` logging convention);
    ///   3. a TTY-aware default — `table` when stdout is an interactive
    ///      terminal, `json` when piped or redirected.
    ///
    /// An invalid `<NAME>_OUTPUT` value is ignored (falls through to the
    /// TTY-aware default), so a stray env var never breaks the CLI.
    ///
    /// Returns `Err(FormatError::UnknownFormat)` for unrecognised
    /// `--format` values. Callers should map this into their error type
    /// (e.g. `CliError::Validation`).
    pub fn from_matches(matches: &clap::ArgMatches, app_name: &str) -> Result<Self, FormatError> {
        let format = match matches.get_one::<String>("format") {
            Some(s) => OutputFormat::parse(s).map_err(FormatError::UnknownFormat)?,
            None => {
                let env_var = format!("{}_OUTPUT", app_name.to_uppercase().replace('-', "_"));
                let env_value = std::env::var(env_var).ok();
                resolve_default_format(env_value.as_deref(), std::io::stdout().is_terminal())
            }
        };
        let quiet = matches
            .try_get_one::<bool>("quiet")
            .ok()
            .flatten()
            .copied()
            .unwrap_or(false);
        let query = matches
            .try_get_one::<String>("query")
            .ok()
            .flatten()
            .cloned();
        // Validate the expression eagerly so typos are caught before the
        // request is sent.
        if let Some(ref expr) = query {
            jmespath::compile(expr)
                .map_err(|e| FormatError::InvalidQuery(e.to_string()))?;
        }
        Ok(Self {
            format,
            color_mode: ColorMode::Auto,
            quiet,
            query,
        })
    }

    /// Whether the pipeline is in raw mode (bypass formatting).
    pub fn is_raw(&self) -> bool {
        self.format == OutputFormat::Raw
    }

    /// Whether the pipeline is in HTTP mode (full HTTP response output).
    pub fn is_http(&self) -> bool {
        self.format == OutputFormat::Http
    }

    /// Render `value` to `out`, appending a trailing newline.
    ///
    /// When `quiet` is set, this is a no-op — the value is silently discarded.
    /// When a `--query` expression is set, it is applied before formatting.
    pub fn emit<W: std::io::Write>(
        &self,
        out: &mut W,
        value: &Value,
        paginated: bool,
        is_first_page: bool,
    ) -> Result<(), FormatError> {
        if self.quiet {
            return Ok(());
        }
        // Avoid cloning when no --query is set (the common path).
        let owned;
        let effective = match &self.query {
            Some(_) => {
                owned = self.apply_query(value)?;
                &owned
            }
            None => value,
        };
        let rendered = if paginated {
            format_value_paginated(effective, &self.format, is_first_page)
        } else {
            format_value(effective, &self.format)
        };
        writeln!(out, "{rendered}")?;
        Ok(())
    }

    /// Render a pre-projected `value` to `out` without applying `--query`.
    ///
    /// Used by streaming paths that have already applied `apply_query_streaming`
    /// and want to emit the result without re-projecting.
    pub fn emit_raw<W: std::io::Write>(
        &self,
        out: &mut W,
        value: &Value,
        paginated: bool,
        is_first_page: bool,
    ) -> Result<(), FormatError> {
        if self.quiet {
            return Ok(());
        }
        let rendered = if paginated {
            format_value_paginated(value, &self.format, is_first_page)
        } else {
            format_value(value, &self.format)
        };
        writeln!(out, "{rendered}")?;
        Ok(())
    }

    /// Apply the `--query` JMESPath expression to `value`.
    ///
    /// Returns the projected value, or the original value unchanged when no
    /// query is configured.
    pub fn apply_query(&self, value: &Value) -> Result<Value, FormatError> {
        match &self.query {
            None => Ok(value.clone()),
            Some(expr_str) => apply_jmespath(value, expr_str),
        }
    }

    /// Apply `--query` and return `None` when the projection is null.
    ///
    /// Used by streaming paths: events whose projection is `null` are
    /// suppressed, enabling `--query` as a per-event filter.
    pub fn apply_query_streaming(&self, value: &Value) -> Result<Option<Value>, FormatError> {
        match &self.query {
            None => Ok(Some(value.clone())),
            Some(expr_str) => {
                let result = apply_jmespath(value, expr_str)?;
                if result.is_null() {
                    Ok(None)
                } else {
                    Ok(Some(result))
                }
            }
        }
    }
}

/// Resolve the default output format when no `--format` flag was passed.
///
/// Implements steps 2–3 of the [`OutputPipeline::from_matches`] precedence:
///   - if `env_value` is a valid format string, use it;
///   - otherwise fall back to the TTY-aware default — [`OutputFormat::Table`]
///     when stdout is an interactive terminal, [`OutputFormat::Json`] when
///     piped or redirected.
///
/// An unset or invalid `env_value` is treated identically (ignored), so a
/// stray `<NAME>_OUTPUT` value never breaks the CLI.
///
/// Pure (no IO) so it can be unit-tested by injecting `stdout_is_terminal`.
fn resolve_default_format(env_value: Option<&str>, stdout_is_terminal: bool) -> OutputFormat {
    if let Some(parsed) = env_value.and_then(|v| OutputFormat::parse(v).ok()) {
        return parsed;
    }
    if stdout_is_terminal {
        OutputFormat::Table
    } else {
        OutputFormat::Json
    }
}

/// Supported output formats.
#[derive(Debug, Clone, PartialEq, Default)]
pub enum OutputFormat {
    /// Pretty-printed JSON (default).
    #[default]
    Json,
    /// Aligned text table.
    Table,
    /// YAML.
    Yaml,
    /// Comma-separated values.
    Csv,
    /// Raw server bytes — no parsing, no transformation.
    Raw,
    /// JSONL / NDJSON — one compact JSON value per line.
    Jsonl,
    /// Full HTTP response (status line + headers + body) — like `curl -i`.
    Http,
}

impl OutputFormat {
    /// Parse from a string argument.
    ///
    /// Returns `Ok(format)` for known values, or `Err(unknown_value)` if the
    /// string is not recognised.  Call sites should warn the user on `Err` and
    /// decide whether to fall back to JSON or surface an error.
    pub fn parse(s: &str) -> Result<Self, String> {
        match s.to_lowercase().as_str() {
            "json" => Ok(Self::Json),
            "table" => Ok(Self::Table),
            "yaml" | "yml" => Ok(Self::Yaml),
            "csv" => Ok(Self::Csv),
            "raw" => Ok(Self::Raw),
            "jsonl" | "ndjson" => Ok(Self::Jsonl),
            "http" => Ok(Self::Http),
            other => Err(other.to_string()),
        }
    }

    /// Parse from a string argument, falling back to JSON for unknown values.
    ///
    /// Prefer `parse()` at call sites where you want to surface a warning.
    #[allow(clippy::should_implement_trait)]
    pub fn from_str(s: &str) -> Self {
        Self::parse(s).unwrap_or(Self::Json)
    }
}

/// Format a JSON value according to the specified output format.
pub fn format_value(value: &Value, format: &OutputFormat) -> String {
    match format {
        OutputFormat::Json => serde_json::to_string_pretty(value).unwrap_or_default(),
        OutputFormat::Table => format_table(value),
        OutputFormat::Yaml => format_yaml(value),
        OutputFormat::Csv => format_csv(value),
        // Defensive fallback; the executor normally bypasses format_value.
        OutputFormat::Raw => serde_json::to_string(value).unwrap_or_default(),
        OutputFormat::Jsonl => format_jsonl(value),
        // Defensive fallback; the executor normally bypasses format_value for Http.
        OutputFormat::Http => serde_json::to_string(value).unwrap_or_default(),
    }
}

/// Format a JSON value for a paginated page.
///
/// When auto-paginating with `--page-all`, CSV and table formats should only
/// emit column headers on the **first** page so that each subsequent page
/// contains only data rows, making the combined output machine-parseable.
///
/// For JSON the output is compact (one JSON object per line / NDJSON).
/// For YAML each page is prefixed with a `---` document separator so the
/// combined stream is a valid YAML multi-document file.
pub fn format_value_paginated(value: &Value, format: &OutputFormat, is_first_page: bool) -> String {
    match format {
        OutputFormat::Json => serde_json::to_string(value).unwrap_or_default(),
        OutputFormat::Csv => format_csv_page(value, is_first_page),
        OutputFormat::Table => format_table_page(value, is_first_page),
        // Prefix every page with a YAML document separator so that the
        // concatenated stream is parseable as a multi-document YAML file.
        OutputFormat::Yaml => format!("---\n{}", format_yaml(value)),
        OutputFormat::Raw => serde_json::to_string(value).unwrap_or_default(),
        OutputFormat::Jsonl => format_jsonl(value),
        OutputFormat::Http => serde_json::to_string(value).unwrap_or_default(),
    }
}

/// Format a JSON value as JSONL (one compact JSON line per element).
///
/// For array values (or list-shaped API responses with an extractable data
/// array), each element is serialized as a single compact JSON line. For
/// non-array values, the entire value is serialized as one compact line.
fn format_jsonl(value: &Value) -> String {
    // Try to extract a data array from a list-shaped response.
    if let Some((_key, arr)) = extract_items(value) {
        return format_jsonl_array(arr);
    }
    // Top-level array.
    if let Value::Array(arr) = value {
        return format_jsonl_array(arr);
    }
    // Single object/scalar: one compact line.
    serde_json::to_string(value).unwrap_or_default()
}

/// Serialize each element as a compact JSON line, joined by newlines.
fn format_jsonl_array(arr: &[Value]) -> String {
    let mut out = String::new();
    for (i, item) in arr.iter().enumerate() {
        if i > 0 {
            out.push('\n');
        }
        out.push_str(&serde_json::to_string(item).unwrap_or_default());
    }
    out
}

/// Extract a "data array" from a typical API list response.
/// APIs often return lists as `{ "collection": [...], "pagination": {...} }`
/// where the array key varies by resource type.
fn extract_items(value: &Value) -> Option<(&str, &Vec<Value>)> {
    if let Value::Object(obj) = value {
        for (key, val) in obj {
            if key == "nextPageToken" || key == "kind" || key.starts_with('_') {
                continue;
            }
            if let Value::Array(arr) = val {
                if !arr.is_empty() {
                    return Some((key, arr));
                }
            }
        }
    }
    None
}

fn format_table(value: &Value) -> String {
    format_table_page(value, true)
}

/// Recursively flatten a JSON object into `(dot.notation.key, string_value)` pairs.
///
/// Nested objects become `parent.child` key names so that `--format table` can
/// render them as individual columns instead of raw JSON blobs.
fn flatten_object(obj: &serde_json::Map<String, Value>, prefix: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    for (key, val) in obj {
        let full_key = if prefix.is_empty() {
            key.clone()
        } else {
            format!("{prefix}.{key}")
        };
        match val {
            Value::Object(nested) => {
                out.extend(flatten_object(nested, &full_key));
            }
            _ => {
                out.push((full_key, value_to_cell(val)));
            }
        }
    }
    out
}

/// Format as a text table, optionally omitting the header row.
///
/// Pass `emit_header = false` for continuation pages when using `--page-all`
/// so the combined terminal output doesn't repeat column names and separator
/// lines between pages.
fn format_table_page(value: &Value, emit_header: bool) -> String {
    // Try to extract a list of items from standard API response
    let items = extract_items(value);

    if let Some((_key, arr)) = items {
        format_array_as_table(arr, emit_header)
    } else if let Value::Array(arr) = value {
        format_array_as_table(arr, emit_header)
    } else if let Value::Object(obj) = value {
        // Single object: key/value table — flatten nested objects first
        let mut output = String::new();
        let flat = flatten_object(obj, "");
        let max_key_len = flat.iter().map(|(k, _)| k.len()).max().unwrap_or(0);
        for (key, val_str) in &flat {
            let _ = writeln!(output, "{key:max_key_len$}  {val_str}");
        }
        output
    } else {
        value.to_string()
    }
}

fn format_array_as_table(arr: &[Value], emit_header: bool) -> String {
    if arr.is_empty() {
        return "(empty)\n".to_string();
    }

    // Flatten each row so nested objects become dot-notation columns.
    let flat_rows: Vec<Vec<(String, String)>> = arr
        .iter()
        .map(|item| match item {
            Value::Object(obj) => flatten_object(obj, ""),
            _ => vec![(String::new(), value_to_cell(item))],
        })
        .collect();

    // Collect all unique column names (preserving insertion order).
    let mut columns: Vec<String> = Vec::new();
    for row in &flat_rows {
        for (key, _) in row {
            if !columns.contains(key) {
                columns.push(key.clone());
            }
        }
    }

    if columns.is_empty() {
        // Array of non-objects
        let mut output = String::new();
        for item in arr {
            let _ = writeln!(output, "{}", value_to_cell(item));
        }
        return output;
    }

    // Build lookup: row_index -> column_name -> cell_value
    let row_maps: Vec<std::collections::HashMap<&str, &str>> = flat_rows
        .iter()
        .map(|pairs| {
            pairs
                .iter()
                .map(|(k, v)| (k.as_str(), v.as_str()))
                .collect()
        })
        .collect();

    // Calculate column widths (char-count, not byte-count).
    let mut widths: Vec<usize> = columns.iter().map(|c| c.chars().count()).collect();
    let rows: Vec<Vec<String>> = row_maps
        .iter()
        .map(|row| {
            columns
                .iter()
                .enumerate()
                .map(|(i, col)| {
                    let cell = row.get(col.as_str()).copied().unwrap_or("").to_string();
                    let char_len = cell.chars().count();
                    if char_len > widths[i] {
                        widths[i] = char_len;
                    }
                    // Cap column width at 60 chars
                    if widths[i] > 60 {
                        widths[i] = 60;
                    }
                    cell
                })
                .collect()
        })
        .collect();

    let mut output = String::new();

    if emit_header {
        // Header
        let header: Vec<String> = columns
            .iter()
            .enumerate()
            .map(|(i, c)| format!("{:width$}", c, width = widths[i]))
            .collect();
        let _ = writeln!(output, "{}", header.join("  "));

        // Separator
        let sep: Vec<String> = widths.iter().map(|w| "─".repeat(*w)).collect();
        let _ = writeln!(output, "{}", sep.join("  "));
    }

    // Rows — truncate by char count to avoid panicking on multi-byte UTF-8.
    for row in &rows {
        let cells: Vec<String> = row
            .iter()
            .enumerate()
            .map(|(i, c)| {
                let char_len = c.chars().count();
                let truncated = if char_len > widths[i] {
                    // Safe char-boundary slice: take widths[i]-1 chars, then append ellipsis.
                    let truncated_str: String = c.chars().take(widths[i] - 1).collect();
                    format!("{truncated_str}…")
                } else {
                    c.clone()
                };
                // Pad to column width (by char count)
                let pad = widths[i].saturating_sub(truncated.chars().count());
                format!("{truncated}{}", " ".repeat(pad))
            })
            .collect();
        let _ = writeln!(output, "{}", cells.join("  "));
    }

    output
}

fn format_yaml(value: &Value) -> String {
    let raw = json_to_yaml(value, 0);
    // The recursive serialiser prepends `\n` before each key/item so that
    // nested levels compose cleanly. At the top level we strip the leading
    // newline so the final output starts with content, not a blank line.
    raw.strip_prefix('\n').unwrap_or(&raw).to_string()
}

fn json_to_yaml(value: &Value, indent: usize) -> String {
    let prefix = "  ".repeat(indent);
    match value {
        Value::Null => "null".to_string(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => n.to_string(),
        Value::String(s) => {
            if s.contains('\n') {
                // Genuine multi-line content: block scalar is the most readable choice.
                format!(
                    "|\n{}",
                    s.lines()
                        .map(|l| format!("{prefix}  {l}"))
                        .collect::<Vec<_>>()
                        .join("\n")
                )
            } else {
                // Single-line strings: always double-quote so that characters like
                // `#` (comment marker) and `:` (mapping indicator) are never
                // misinterpreted by YAML parsers.  Escape backslashes and double
                // quotes to keep the output valid.
                let escaped = s.replace('\\', "\\\\").replace('"', "\\\"");
                format!("\"{escaped}\"")
            }
        }
        Value::Array(arr) => {
            if arr.is_empty() {
                return "[]".to_string();
            }
            let mut out = String::new();
            let inner_prefix = "  ".repeat(indent + 1);
            for item in arr {
                let val_str = json_to_yaml(item, indent + 1);
                // Object/array values start with `\n` + indent; strip both so
                // the first key lands on the same line as the dash (standard
                // YAML block-sequence style). Subsequent lines keep their full
                // indent, which aligns them with the first key.
                let inline = val_str
                    .strip_prefix('\n')
                    .and_then(|s| s.strip_prefix(inner_prefix.as_str()))
                    .unwrap_or(&val_str);
                let _ = write!(out, "\n{prefix}- {inline}");
            }
            out
        }
        Value::Object(obj) => {
            if obj.is_empty() {
                return "{}".to_string();
            }
            let mut out = String::new();
            for (key, val) in obj {
                match val {
                    Value::Object(_) | Value::Array(_) => {
                        let val_str = json_to_yaml(val, indent + 1);
                        if val_str.starts_with('\n') {
                            // Multi-line: colon immediately before the newline
                            let _ = write!(out, "\n{prefix}{key}:{val_str}");
                        } else {
                            // Single-line (empty collection): standard space
                            let _ = write!(out, "\n{prefix}{key}: {val_str}");
                        }
                    }
                    _ => {
                        let val_str = json_to_yaml(val, indent);
                        let _ = write!(out, "\n{prefix}{key}: {val_str}");
                    }
                }
            }
            out
        }
    }
}

fn format_csv(value: &Value) -> String {
    format_csv_page(value, true)
}

/// Format as CSV, optionally omitting the header row.
///
/// Pass `emit_header = false` for all pages after the first when using
/// `--page-all`, so the combined output has a single header line.
fn format_csv_page(value: &Value, emit_header: bool) -> String {
    let items = extract_items(value);

    let arr = if let Some((_key, arr)) = items {
        arr.as_slice()
    } else if let Value::Array(arr) = value {
        arr.as_slice()
    } else {
        // Single value — just output it
        return value_to_cell(value);
    };

    if arr.is_empty() {
        return String::new();
    }

    // Array of non-objects
    if !arr.iter().any(|v| v.is_object()) {
        let mut output = String::new();
        for item in arr {
            if let Value::Array(inner) = item {
                let cells: Vec<String> = inner
                    .iter()
                    .map(|v| csv_escape(&value_to_cell(v)))
                    .collect();
                let _ = writeln!(output, "{}", cells.join(","));
            } else {
                let _ = writeln!(output, "{}", csv_escape(&value_to_cell(item)));
            }
        }
        return output;
    }

    // Collect columns
    let mut columns: Vec<String> = Vec::new();
    for item in arr {
        if let Value::Object(obj) = item {
            for key in obj.keys() {
                if !columns.contains(key) {
                    columns.push(key.clone());
                }
            }
        }
    }

    let mut output = String::new();

    // Header (omitted on continuation pages)
    if emit_header {
        let _ = writeln!(output, "{}", columns.join(","));
    }

    // Rows
    for item in arr {
        let cells: Vec<String> = columns
            .iter()
            .map(|col| {
                if let Value::Object(obj) = item {
                    csv_escape(&value_to_cell(obj.get(col).unwrap_or(&Value::Null)))
                } else {
                    String::new()
                }
            })
            .collect();
        let _ = writeln!(output, "{}", cells.join(","));
    }

    output
}

fn csv_escape(s: &str) -> String {
    if s.contains(',') || s.contains('"') || s.contains('\n') {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}

fn value_to_cell(value: &Value) -> String {
    match value {
        Value::Null => String::new(),
        Value::String(s) => s.clone(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => n.to_string(),
        Value::Array(arr) => {
            let items: Vec<String> = arr.iter().map(value_to_cell).collect();
            items.join(", ")
        }
        Value::Object(_) => serde_json::to_string(value).unwrap_or_default(),
    }
}

/// Apply a JMESPath expression to a `serde_json::Value`.
///
/// Converts the value to the `jmespath::Variable` domain, searches, then
/// converts the result back to `serde_json::Value`. Returns `Value::Null`
/// when the expression does not match anything in the input.
pub(crate) fn apply_jmespath(value: &Value, expr_str: &str) -> Result<Value, FormatError> {
    let expr = jmespath::compile(expr_str)
        .map_err(|e| FormatError::InvalidQuery(e.to_string()))?;
    // Convert serde_json::Value → JSON string → jmespath::Variable.
    let json_str =
        serde_json::to_string(value).map_err(|e| FormatError::QueryEvaluation(e.to_string()))?;
    let data = jmespath::Variable::from_json(&json_str)
        .map_err(|e| FormatError::QueryEvaluation(e.to_string()))?;
    let result = expr
        .search(data)
        .map_err(|e| FormatError::QueryEvaluation(e.to_string()))?;
    // Convert jmespath::Variable → JSON string → serde_json::Value.
    let result_json =
        serde_json::to_string(&*result).map_err(|e| FormatError::QueryEvaluation(e.to_string()))?;
    serde_json::from_str(&result_json).map_err(|e| FormatError::QueryEvaluation(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_output_format_from_str() {
        assert_eq!(OutputFormat::from_str("json"), OutputFormat::Json);
        assert_eq!(OutputFormat::from_str("table"), OutputFormat::Table);
        assert_eq!(OutputFormat::from_str("yaml"), OutputFormat::Yaml);
        assert_eq!(OutputFormat::from_str("yml"), OutputFormat::Yaml);
        assert_eq!(OutputFormat::from_str("csv"), OutputFormat::Csv);
        assert_eq!(OutputFormat::from_str("unknown"), OutputFormat::Json);
    }

    #[test]
    fn test_output_format_parse_known() {
        assert_eq!(OutputFormat::parse("json"), Ok(OutputFormat::Json));
        assert_eq!(OutputFormat::parse("table"), Ok(OutputFormat::Table));
        assert_eq!(OutputFormat::parse("yaml"), Ok(OutputFormat::Yaml));
        assert_eq!(OutputFormat::parse("yml"), Ok(OutputFormat::Yaml));
        assert_eq!(OutputFormat::parse("csv"), Ok(OutputFormat::Csv));
        // Case-insensitive
        assert_eq!(OutputFormat::parse("JSON"), Ok(OutputFormat::Json));
        assert_eq!(OutputFormat::parse("TABLE"), Ok(OutputFormat::Table));
    }

    #[test]
    fn test_output_format_parse_unknown_returns_err() {
        assert!(OutputFormat::parse("bogus").is_err());
        assert_eq!(OutputFormat::parse("bogus").unwrap_err(), "bogus");
        assert!(OutputFormat::parse("").is_err());
    }

    #[test]
    fn test_format_json() {
        let val = json!({"name": "test"});
        let output = format_value(&val, &OutputFormat::Json);
        assert!(output.contains("\"name\""));
        assert!(output.contains("\"test\""));
    }

    #[test]
    fn test_format_table_array_of_objects() {
        let val = json!({
            "files": [
                {"id": "1", "name": "hello.txt"},
                {"id": "2", "name": "world.txt"}
            ]
        });
        let output = format_value(&val, &OutputFormat::Table);
        assert!(output.contains("id"));
        assert!(output.contains("name"));
        assert!(output.contains("hello.txt"));
        assert!(output.contains("world.txt"));
        // Check separator line
        assert!(output.contains("──"));
    }

    #[test]
    fn test_format_table_single_object() {
        let val = json!({"id": "abc", "name": "test"});
        let output = format_value(&val, &OutputFormat::Table);
        assert!(output.contains("id"));
        assert!(output.contains("abc"));
    }

    #[test]
    fn test_format_table_nested_object_flattened() {
        // Nested objects should become dot-notation columns, not raw JSON blobs.
        let val = json!({
            "user": {
                "displayName": "Alice",
                "emailAddress": "alice@example.com"
            },
            "storageQuota": {
                "limit": "1000",
                "usage": "500"
            }
        });
        let output = format_value(&val, &OutputFormat::Table);
        // Should contain dot-notation keys
        assert!(
            output.contains("user.displayName"),
            "expected flattened key in output:\n{output}"
        );
        assert!(
            output.contains("user.emailAddress"),
            "expected flattened key in output:\n{output}"
        );
        assert!(
            output.contains("Alice"),
            "expected value in output:\n{output}"
        );
        // Should NOT contain raw JSON blobs
        assert!(
            !output.contains("{\"displayName"),
            "should not have raw JSON blob:\n{output}"
        );
    }

    #[test]
    fn test_format_table_nested_objects_in_array() {
        let val = json!([
            {"id": "1", "owner": {"name": "Alice"}},
            {"id": "2", "owner": {"name": "Bob"}}
        ]);
        let output = format_value(&val, &OutputFormat::Table);
        assert!(
            output.contains("owner.name"),
            "expected flattened column:\n{output}"
        );
        assert!(output.contains("Alice"), "expected value:\n{output}");
        assert!(output.contains("Bob"), "expected value:\n{output}");
    }

    #[test]
    fn test_format_table_multibyte_truncation_does_not_panic() {
        // Column width cap is 60 chars, so a long string with multi-byte chars
        // must be safely truncated without a byte-boundary panic.
        let long_emoji = "😀".repeat(70); // each emoji is 4 bytes
        let val = json!([{"col": long_emoji}]);
        // Should not panic
        let output = format_value(&val, &OutputFormat::Table);
        assert!(output.contains("col"), "column name must appear:\n{output}");
    }

    #[test]
    fn test_format_table_multibyte_exact_boundary() {
        // Multi-byte chars at various positions must not panic or produce garbled output.
        let val = json!([{"name": "café résumé naïve"}]);
        let output = format_value(&val, &OutputFormat::Table);
        assert!(output.contains("name"), "column must appear:\n{output}");
    }

    #[test]
    fn test_format_csv() {
        let val = json!({
            "files": [
                {"id": "1", "name": "hello"},
                {"id": "2", "name": "world"}
            ]
        });
        let output = format_value(&val, &OutputFormat::Csv);
        assert!(output.contains("id,name"));
        assert!(output.contains("1,hello"));
        assert!(output.contains("2,world"));
    }

    #[test]
    fn test_format_csv_array_of_arrays() {
        // Sheets API returns {"values": [["col1","col2"], ["a","b"]]}
        let val = json!({
            "values": [
                ["Student Name", "Gender", "Class Level"],
                ["Alexandra", "Female", "4. Senior"],
                ["Andrew", "Male", "1. Freshman"]
            ]
        });
        let output = format_value(&val, &OutputFormat::Csv);
        let lines: Vec<&str> = output.lines().collect();
        assert_eq!(lines[0], "Student Name,Gender,Class Level");
        assert_eq!(lines[1], "Alexandra,Female,4. Senior");
        assert_eq!(lines[2], "Andrew,Male,1. Freshman");
    }

    #[test]
    fn test_format_csv_flat_scalars() {
        // Flat array of non-object, non-array values → one value per line
        let val = json!(["apple", "banana", "cherry"]);
        let output = format_value(&val, &OutputFormat::Csv);
        let lines: Vec<&str> = output.lines().collect();
        assert_eq!(lines.len(), 3);
        assert_eq!(lines[0], "apple");
        assert_eq!(lines[1], "banana");
        assert_eq!(lines[2], "cherry");
    }

    #[test]
    fn test_format_csv_flat_scalars_with_escaping() {
        // Scalars that contain commas/quotes must be CSV-escaped
        let val = json!(["plain", "has,comma", "has\"quote"]);
        let output = format_value(&val, &OutputFormat::Csv);
        let lines: Vec<&str> = output.lines().collect();
        assert_eq!(lines.len(), 3);
        assert_eq!(lines[0], "plain");
        assert_eq!(lines[1], "\"has,comma\"");
        assert_eq!(lines[2], "\"has\"\"quote\"");
    }

    #[test]
    fn test_format_csv_escape() {
        assert_eq!(csv_escape("simple"), "simple");
        assert_eq!(csv_escape("has,comma"), "\"has,comma\"");
        assert_eq!(csv_escape("has\"quote"), "\"has\"\"quote\"");
    }

    #[test]
    fn test_format_yaml() {
        let val = json!({"name": "test", "count": 42});
        let output = format_value(&val, &OutputFormat::Yaml);
        assert!(output.contains("name: \"test\""));
        assert!(output.contains("count: 42"));
    }

    #[test]
    fn test_format_table_empty_array() {
        let val = json!({"files": []});
        // No items to extract, falls back to single-object table
        let output = format_value(&val, &OutputFormat::Table);
        assert!(output.contains("files"));
    }

    #[test]
    fn test_extract_items() {
        let val = json!({"files": [{"id": "1"}], "nextPageToken": "abc"});
        let (key, items) = extract_items(&val).unwrap();
        assert_eq!(key, "files");
        assert_eq!(items.len(), 1);
    }

    #[test]
    fn test_extract_items_none() {
        let val = json!({"status": "ok"});
        assert!(extract_items(&val).is_none());
    }

    // --- YAML block-scalar regression tests ---

    #[test]
    fn test_format_yaml_hash_in_string_is_quoted_not_block() {
        // `drive#file` contains `#` which is a YAML comment marker; the
        // serialiser must quote it rather than emit a block scalar.
        let val = json!({"kind": "drive#file", "id": "123"});
        let output = format_value(&val, &OutputFormat::Yaml);
        // Must be a double-quoted string, not a block scalar (`|`).
        assert!(
            output.contains("kind: \"drive#file\""),
            "expected double-quoted kind, got:\n{output}"
        );
        assert!(
            !output.contains("kind: |"),
            "kind must not use block scalar, got:\n{output}"
        );
    }

    #[test]
    fn test_format_yaml_colon_in_string_is_quoted() {
        let val = json!({"url": "https://example.com/path"});
        let output = format_value(&val, &OutputFormat::Yaml);
        assert!(
            output.contains("url: \"https://example.com/path\""),
            "expected double-quoted url, got:\n{output}"
        );
        assert!(!output.contains("url: |"), "url must not use block scalar");
    }

    #[test]
    fn test_format_yaml_multiline_still_uses_block() {
        let val = json!({"body": "line one\nline two"});
        let output = format_value(&val, &OutputFormat::Yaml);
        // Multi-line content should still use block scalar.
        assert!(
            output.contains("body: |"),
            "multiline string must use block scalar, got:\n{output}"
        );
    }

    #[test]
    fn test_format_yaml_no_leading_blank_line() {
        let val = json!({"name": "test", "count": 42});
        let output = format_value(&val, &OutputFormat::Yaml);
        assert!(
            !output.starts_with('\n'),
            "YAML output must not start with a blank line, got:\n{output}"
        );
        assert!(
            output.starts_with("name:") || output.starts_with("count:"),
            "YAML output must start with a key, got:\n{output}"
        );
    }

    #[test]
    fn test_format_yaml_empty_array_has_space() {
        let val = json!({"items": [], "name": "test"});
        let output = format_value(&val, &OutputFormat::Yaml);
        assert!(
            output.contains("items: []"),
            "empty array must have a space after colon, got:\n{output}"
        );
        assert!(
            !output.contains("items:[]"),
            "must not produce 'key:[]' without space, got:\n{output}"
        );
    }

    #[test]
    fn test_format_yaml_empty_object_has_space() {
        let val = json!({"metadata": {}, "id": "1"});
        let output = format_value(&val, &OutputFormat::Yaml);
        assert!(
            output.contains("metadata: {}"),
            "empty object must have a space after colon, got:\n{output}"
        );
    }

    #[test]
    fn test_format_yaml_nested_object() {
        let val = json!({"user": {"name": "Alice", "age": 30}});
        let output = format_value(&val, &OutputFormat::Yaml);
        assert!(
            output.contains("user:"),
            "nested object key must appear, got:\n{output}"
        );
        assert!(
            output.contains("  name: \"Alice\""),
            "nested key must be indented, got:\n{output}"
        );
        assert!(
            output.contains("  age: 30"),
            "nested numeric value must be indented, got:\n{output}"
        );
    }

    #[test]
    fn test_format_yaml_nested_array() {
        let val = json!({"tags": ["alpha", "beta"]});
        let output = format_value(&val, &OutputFormat::Yaml);
        assert!(
            output.contains("tags:"),
            "array key must appear, got:\n{output}"
        );
        assert!(
            output.contains("- \"alpha\""),
            "array items must use dash notation, got:\n{output}"
        );
        assert!(
            output.contains("- \"beta\""),
            "array items must use dash notation, got:\n{output}"
        );
    }

    #[test]
    fn test_format_yaml_array_of_objects() {
        let val = json!([
            {"id": "1", "name": "foo"},
            {"id": "2", "name": "bar"}
        ]);
        let output = format_value(&val, &OutputFormat::Yaml);
        assert!(
            output.contains("- id: \"1\""),
            "array items must use dash + key, got:\n{output}"
        );
    }

    #[test]
    fn test_format_yaml_top_level_array() {
        let val = json!(["one", "two", "three"]);
        let output = format_value(&val, &OutputFormat::Yaml);
        assert!(
            output.starts_with("- \"one\""),
            "top-level array must start with dash, got:\n{output}"
        );
    }

    #[test]
    fn test_format_yaml_null_bool_number() {
        let val = json!({"n": null, "b": true, "i": 42, "f": 3.14});
        let output = format_value(&val, &OutputFormat::Yaml);
        assert!(output.contains("n: null"), "null, got:\n{output}");
        assert!(output.contains("b: true"), "bool, got:\n{output}");
        assert!(output.contains("i: 42"), "int, got:\n{output}");
        assert!(output.contains("f: 3.14"), "float, got:\n{output}");
    }

    // --- Paginated format tests ---

    #[test]
    fn test_format_value_paginated_csv_first_page_has_header() {
        let val = json!({
            "files": [
                {"id": "1", "name": "a.txt"},
                {"id": "2", "name": "b.txt"}
            ]
        });
        let output = format_value_paginated(&val, &OutputFormat::Csv, true);
        let lines: Vec<&str> = output.lines().collect();
        assert_eq!(lines[0], "id,name", "first page must start with header");
        assert_eq!(lines[1], "1,a.txt");
    }

    #[test]
    fn test_format_value_paginated_csv_continuation_no_header() {
        let val = json!({
            "files": [
                {"id": "3", "name": "c.txt"}
            ]
        });
        let output = format_value_paginated(&val, &OutputFormat::Csv, false);
        let lines: Vec<&str> = output.lines().collect();
        // The first (and only) line must be a data row, not the header.
        assert_eq!(lines[0], "3,c.txt", "continuation page must have no header");
        assert!(
            !output.contains("id,name"),
            "header must be absent on continuation pages"
        );
    }

    #[test]
    fn test_format_value_paginated_table_first_page_has_header() {
        let val = json!({
            "items": [
                {"id": "1", "name": "foo"}
            ]
        });
        let output = format_value_paginated(&val, &OutputFormat::Table, true);
        assert!(
            output.contains("id"),
            "table header must appear on first page"
        );
        assert!(output.contains("──"), "separator must appear on first page");
    }

    #[test]
    fn test_format_value_paginated_table_continuation_no_header() {
        let val = json!({
            "items": [
                {"id": "2", "name": "bar"}
            ]
        });
        let output = format_value_paginated(&val, &OutputFormat::Table, false);
        assert!(output.contains("bar"), "data row must be present");
        assert!(
            !output.contains("──"),
            "separator must be absent on continuation pages"
        );
    }

    #[test]
    fn test_format_value_paginated_yaml_has_document_separator() {
        let val = json!({"files": [{"id": "1", "name": "foo"}]});
        let first = format_value_paginated(&val, &OutputFormat::Yaml, true);
        let second = format_value_paginated(&val, &OutputFormat::Yaml, false);
        assert!(
            first.starts_with("---\n"),
            "first YAML page must start with ---"
        );
        assert!(
            second.starts_with("---\n"),
            "continuation YAML pages must also start with ---"
        );
    }

    // -----------------------------------------------------------------------
    // OutputPipeline (Step 1: abstraction only — format + color_mode)
    // -----------------------------------------------------------------------

    fn matches_for(args: &[&str]) -> clap::ArgMatches {
        clap::Command::new("test")
            .arg(
                clap::Arg::new("format")
                    .long("format")
                    .value_name("FORMAT"),
            )
            .try_get_matches_from(args)
            .expect("clap parse should succeed in tests")
    }

    #[test]
    fn pipeline_from_matches_reads_explicit_format() {
        // An explicit `--format` flag is honored regardless of TTY / env.
        let matches = matches_for(&["test", "--format", "yaml"]);
        let pipeline = OutputPipeline::from_matches(&matches, "test").unwrap();
        assert_eq!(pipeline.format, OutputFormat::Yaml);
        assert_eq!(pipeline.color_mode, ColorMode::Auto);
    }

    #[test]
    fn pipeline_from_matches_rejects_unknown_format() {
        let matches = matches_for(&["test", "--format", "garbage"]);
        let err = OutputPipeline::from_matches(&matches, "test").unwrap_err();
        assert!(
            matches!(err, FormatError::UnknownFormat(ref s) if s == "garbage"),
            "expected UnknownFormat, got: {err:?}",
        );
    }

    // -----------------------------------------------------------------------
    // Default-format precedence: flag > <NAME>_OUTPUT env > TTY-aware default
    // -----------------------------------------------------------------------

    #[test]
    fn resolve_default_format_no_env_piped_is_json() {
        // No env override + non-terminal stdout (piped/redirected) → JSON.
        assert_eq!(resolve_default_format(None, false), OutputFormat::Json);
    }

    #[test]
    fn resolve_default_format_no_env_terminal_is_table() {
        // No env override + interactive terminal → table.
        assert_eq!(resolve_default_format(None, true), OutputFormat::Table);
    }

    #[test]
    fn resolve_default_format_valid_env_wins_over_tty_default() {
        // A valid env value beats the TTY-aware default in both directions.
        assert_eq!(
            resolve_default_format(Some("yaml"), true),
            OutputFormat::Yaml,
        );
        assert_eq!(
            resolve_default_format(Some("csv"), false),
            OutputFormat::Csv,
        );
    }

    #[test]
    fn resolve_default_format_env_is_case_insensitive() {
        assert_eq!(
            resolve_default_format(Some("TABLE"), false),
            OutputFormat::Table,
        );
    }

    #[test]
    fn resolve_default_format_invalid_env_falls_back_to_tty_default() {
        // A bogus env value is ignored — the TTY-aware default applies.
        assert_eq!(
            resolve_default_format(Some("garbage"), false),
            OutputFormat::Json,
        );
        assert_eq!(
            resolve_default_format(Some("garbage"), true),
            OutputFormat::Table,
        );
    }

    #[test]
    fn resolve_default_format_empty_env_falls_back_to_tty_default() {
        // An empty env value parses as unknown → TTY default.
        assert_eq!(resolve_default_format(Some(""), false), OutputFormat::Json);
    }

    #[test]
    fn pipeline_from_matches_explicit_flag_beats_env() {
        // Flag (step 1) wins even when <NAME>_OUTPUT (step 2) is set.
        std::env::set_var("FMTTEST_FLAGWINS_OUTPUT", "csv");
        let matches = matches_for(&["test", "--format", "yaml"]);
        let pipeline = OutputPipeline::from_matches(&matches, "fmttest-flagwins").unwrap();
        std::env::remove_var("FMTTEST_FLAGWINS_OUTPUT");
        assert_eq!(pipeline.format, OutputFormat::Yaml);
    }

    #[test]
    fn pipeline_from_matches_env_var_name_mirrors_logging_convention() {
        // `<NAME>_OUTPUT` uppercases the binary name and maps `-` → `_`,
        // matching the `<NAME>_LOG` convention. No flag → env is consulted.
        std::env::set_var("MY_CLI_OUTPUT", "yaml");
        let matches = matches_for(&["test"]);
        let pipeline = OutputPipeline::from_matches(&matches, "my-cli").unwrap();
        std::env::remove_var("MY_CLI_OUTPUT");
        assert_eq!(pipeline.format, OutputFormat::Yaml);
    }

    #[test]
    fn pipeline_emit_single_page_json_is_pretty_with_trailing_newline() {
        let pipeline = OutputPipeline {
            format: OutputFormat::Json,
            color_mode: ColorMode::Never,
            quiet: false,
            query: None,
        };
        let val = json!({"name": "test", "n": 1});
        let mut buf: Vec<u8> = Vec::new();
        pipeline.emit(&mut buf, &val, false, true).unwrap();
        let s = String::from_utf8(buf).unwrap();
        // pretty JSON spans multiple lines
        assert!(s.contains("\"name\": \"test\""), "expected pretty JSON, got: {s}");
        assert!(s.contains('\n'), "expected indented (multi-line) JSON");
        assert!(s.ends_with('\n'), "expected trailing newline");
    }

    #[test]
    fn pipeline_emit_paginated_json_is_compact_one_line() {
        let pipeline = OutputPipeline {
            format: OutputFormat::Json,
            color_mode: ColorMode::Never,
            quiet: false,
            query: None,
        };
        let val = json!({"name": "test", "n": 1});
        let mut buf: Vec<u8> = Vec::new();
        pipeline.emit(&mut buf, &val, true, true).unwrap();
        let s = String::from_utf8(buf).unwrap();
        // compact form: exactly one newline (the trailing one); no pretty
        // indentation; suitable for NDJSON.
        let body = s.strip_suffix('\n').expect("trailing newline");
        assert!(!body.contains('\n'), "expected single-line NDJSON, got: {s}");
        assert!(!body.contains("  "), "expected no indentation, got: {s}");
        assert!(body.contains("\"name\":\"test\""), "expected compact JSON, got: {s}");
    }

    #[test]
    fn pipeline_emit_quiet_suppresses_output() {
        let pipeline = OutputPipeline {
            format: OutputFormat::Json,
            color_mode: ColorMode::Never,
            quiet: true,
            query: None,
        };
        let val = json!({"name": "test"});
        let mut buf: Vec<u8> = Vec::new();
        pipeline.emit(&mut buf, &val, false, true).unwrap();
        assert!(buf.is_empty(), "quiet mode should suppress all output");
    }

    #[test]
    fn apply_jmespath_extracts_nested_field() {
        let val = json!({"foo": {"bar": "hello"}});
        let result = apply_jmespath(&val, "foo.bar").unwrap();
        assert_eq!(result, json!("hello"));
    }

    #[test]
    fn apply_jmespath_returns_null_for_missing_path() {
        let val = json!({"foo": "bar"});
        let result = apply_jmespath(&val, "nonexistent").unwrap();
        assert_eq!(result, Value::Null);
    }

    #[test]
    fn apply_jmespath_array_filter() {
        let val = json!({"items": [{"name": "a", "active": true}, {"name": "b", "active": false}]});
        let result = apply_jmespath(&val, "items[?active].name").unwrap();
        assert_eq!(result, json!(["a"]));
    }

    #[test]
    fn apply_jmespath_invalid_expression() {
        let val = json!({});
        let result = apply_jmespath(&val, "[");
        assert!(result.is_err());
    }

    #[test]
    fn pipeline_emit_with_query_projects_value() {
        let pipeline = OutputPipeline {
            format: OutputFormat::Json,
            color_mode: ColorMode::Never,
            quiet: false,
            query: Some("name".to_string()),
        };
        let val = json!({"name": "test", "extra": 123});
        let mut buf: Vec<u8> = Vec::new();
        pipeline.emit(&mut buf, &val, false, true).unwrap();
        let s = String::from_utf8(buf).unwrap();
        assert!(s.contains("\"test\""), "expected projected value, got: {s}");
        assert!(!s.contains("extra"), "should not contain non-projected fields");
    }

    #[test]
    fn pipeline_apply_query_streaming_suppresses_null() {
        let pipeline = OutputPipeline {
            format: OutputFormat::Json,
            color_mode: ColorMode::Never,
            quiet: false,
            query: Some("nonexistent".to_string()),
        };
        let val = json!({"foo": "bar"});
        let result = pipeline.apply_query_streaming(&val).unwrap();
        assert!(result.is_none(), "null projection should be suppressed in streaming");
    }

    #[test]
    fn pipeline_apply_query_streaming_passes_non_null() {
        let pipeline = OutputPipeline {
            format: OutputFormat::Json,
            color_mode: ColorMode::Never,
            quiet: false,
            query: Some("foo".to_string()),
        };
        let val = json!({"foo": "bar"});
        let result = pipeline.apply_query_streaming(&val).unwrap();
        assert_eq!(result, Some(json!("bar")));
    }

    // -----------------------------------------------------------------------
    // Raw format
    // -----------------------------------------------------------------------

    #[test]
    fn parse_raw_format() {
        assert_eq!(OutputFormat::parse("raw"), Ok(OutputFormat::Raw));
        assert_eq!(OutputFormat::parse("RAW"), Ok(OutputFormat::Raw));
        assert_eq!(OutputFormat::parse("Raw"), Ok(OutputFormat::Raw));
    }

    #[test]
    fn is_raw_returns_true_for_raw_format() {
        let pipeline = OutputPipeline {
            format: OutputFormat::Raw,
            color_mode: ColorMode::Never,
            quiet: false,
            query: None,
        };
        assert!(pipeline.is_raw());
    }

    #[test]
    fn is_raw_returns_false_for_other_formats() {
        for fmt in [OutputFormat::Json, OutputFormat::Table, OutputFormat::Yaml, OutputFormat::Csv, OutputFormat::Jsonl, OutputFormat::Http] {
            let pipeline = OutputPipeline {
                format: fmt,
                color_mode: ColorMode::Never,
                quiet: false,
                query: None,
            };
            assert!(!pipeline.is_raw());
        }
    }

    #[test]
    fn resolve_default_format_env_raw() {
        assert_eq!(resolve_default_format(Some("raw"), false), OutputFormat::Raw);
    }

    #[test]
    fn pipeline_from_matches_explicit_raw_flag() {
        let matches = matches_for(&["test", "--format", "raw"]);
        let pipeline = OutputPipeline::from_matches(&matches, "test").unwrap();
        assert_eq!(pipeline.format, OutputFormat::Raw);
    }

    #[test]
    fn format_value_raw_fallback_is_compact_json() {
        let val = json!({"name": "test", "n": 1});
        let out = format_value(&val, &OutputFormat::Raw);
        assert!(!out.contains('\n'), "raw fallback should be compact JSON");
        assert!(out.contains("\"name\":\"test\""));
    }

    #[test]
    fn format_value_paginated_raw_fallback_is_compact_json() {
        let val = json!({"items": [1, 2]});
        let first = format_value_paginated(&val, &OutputFormat::Raw, true);
        let second = format_value_paginated(&val, &OutputFormat::Raw, false);
        assert!(!first.contains('\n'));
        assert_eq!(first, second, "raw paginated fallback ignores is_first_page");
    }

    // -----------------------------------------------------------------------
    // JSONL format
    // -----------------------------------------------------------------------

    #[test]
    fn parse_jsonl_format() {
        assert_eq!(OutputFormat::parse("jsonl"), Ok(OutputFormat::Jsonl));
        assert_eq!(OutputFormat::parse("JSONL"), Ok(OutputFormat::Jsonl));
        assert_eq!(OutputFormat::parse("Jsonl"), Ok(OutputFormat::Jsonl));
        assert_eq!(OutputFormat::parse("ndjson"), Ok(OutputFormat::Jsonl));
        assert_eq!(OutputFormat::parse("NDJSON"), Ok(OutputFormat::Jsonl));
    }

    #[test]
    fn jsonl_single_object_is_compact_one_line() {
        let val = json!({"name": "test", "n": 1});
        let out = format_value(&val, &OutputFormat::Jsonl);
        assert!(!out.contains('\n'), "single object should be one line, got: {out}");
        assert!(out.contains("\"name\":\"test\""), "should be compact JSON");
    }

    #[test]
    fn jsonl_top_level_array_flattened() {
        let val = json!([{"id": 1}, {"id": 2}, {"id": 3}]);
        let out = format_value(&val, &OutputFormat::Jsonl);
        let lines: Vec<&str> = out.lines().collect();
        assert_eq!(lines.len(), 3, "each array element on its own line, got: {out}");
        assert_eq!(lines[0], r#"{"id":1}"#);
        assert_eq!(lines[1], r#"{"id":2}"#);
        assert_eq!(lines[2], r#"{"id":3}"#);
    }

    #[test]
    fn jsonl_list_response_extracts_and_flattens_data_array() {
        let val = json!({
            "items": [{"id": "a"}, {"id": "b"}],
            "nextPageToken": "abc"
        });
        let out = format_value(&val, &OutputFormat::Jsonl);
        let lines: Vec<&str> = out.lines().collect();
        assert_eq!(lines.len(), 2, "should flatten extracted data array, got: {out}");
        assert_eq!(lines[0], r#"{"id":"a"}"#);
        assert_eq!(lines[1], r#"{"id":"b"}"#);
    }

    #[test]
    fn jsonl_empty_array_is_empty_string() {
        let val = json!([]);
        let out = format_value(&val, &OutputFormat::Jsonl);
        assert!(out.is_empty(), "empty array should produce empty string, got: {out}");
    }

    #[test]
    fn jsonl_scalar_value() {
        let val = json!(42);
        let out = format_value(&val, &OutputFormat::Jsonl);
        assert_eq!(out, "42");
    }

    #[test]
    fn jsonl_paginated_flattens_array() {
        let val = json!({"events": [{"id": 1}, {"id": 2}]});
        let first = format_value_paginated(&val, &OutputFormat::Jsonl, true);
        let second = format_value_paginated(&val, &OutputFormat::Jsonl, false);
        let lines: Vec<&str> = first.lines().collect();
        assert_eq!(lines.len(), 2);
        assert_eq!(first, second, "jsonl paginated ignores is_first_page");
    }

    #[test]
    fn resolve_default_format_env_jsonl() {
        assert_eq!(resolve_default_format(Some("jsonl"), false), OutputFormat::Jsonl);
    }

    #[test]
    fn pipeline_from_matches_explicit_jsonl_flag() {
        let matches = matches_for(&["test", "--format", "jsonl"]);
        let pipeline = OutputPipeline::from_matches(&matches, "test").unwrap();
        assert_eq!(pipeline.format, OutputFormat::Jsonl);
    }

    #[test]
    fn pipeline_emit_jsonl_flattens_array() {
        let pipeline = OutputPipeline {
            format: OutputFormat::Jsonl,
            color_mode: ColorMode::Never,
            quiet: false,
            query: None,
        };
        let val = json!([{"a": 1}, {"a": 2}]);
        let mut buf: Vec<u8> = Vec::new();
        pipeline.emit(&mut buf, &val, false, true).unwrap();
        let s = String::from_utf8(buf).unwrap();
        let lines: Vec<&str> = s.trim_end().lines().collect();
        assert_eq!(lines.len(), 2, "emit should flatten array to JSONL, got: {s}");
    }

    // -----------------------------------------------------------------------
    // HTTP format
    // -----------------------------------------------------------------------

    #[test]
    fn parse_http_format() {
        assert_eq!(OutputFormat::parse("http"), Ok(OutputFormat::Http));
        assert_eq!(OutputFormat::parse("HTTP"), Ok(OutputFormat::Http));
        assert_eq!(OutputFormat::parse("Http"), Ok(OutputFormat::Http));
    }

    #[test]
    fn is_http_returns_true_for_http_format() {
        let pipeline = OutputPipeline {
            format: OutputFormat::Http,
            color_mode: ColorMode::Never,
            quiet: false,
            query: None,
        };
        assert!(pipeline.is_http());
    }

    #[test]
    fn is_http_returns_false_for_other_formats() {
        for fmt in [OutputFormat::Json, OutputFormat::Table, OutputFormat::Yaml, OutputFormat::Csv, OutputFormat::Raw, OutputFormat::Jsonl] {
            let pipeline = OutputPipeline {
                format: fmt,
                color_mode: ColorMode::Never,
                quiet: false,
                query: None,
            };
            assert!(!pipeline.is_http());
        }
    }

    #[test]
    fn resolve_default_format_env_http() {
        assert_eq!(resolve_default_format(Some("http"), false), OutputFormat::Http);
    }

    #[test]
    fn pipeline_from_matches_explicit_http_flag() {
        let matches = matches_for(&["test", "--format", "http"]);
        let pipeline = OutputPipeline::from_matches(&matches, "test").unwrap();
        assert_eq!(pipeline.format, OutputFormat::Http);
    }

    #[test]
    fn format_value_http_fallback_is_compact_json() {
        let val = json!({"name": "test", "n": 1});
        let out = format_value(&val, &OutputFormat::Http);
        assert!(!out.contains('\n'), "http fallback should be compact JSON");
        assert!(out.contains("\"name\":\"test\""));
    }

    #[test]
    fn format_value_paginated_http_fallback_is_compact_json() {
        let val = json!({"items": [1, 2]});
        let first = format_value_paginated(&val, &OutputFormat::Http, true);
        let second = format_value_paginated(&val, &OutputFormat::Http, false);
        assert!(!first.contains('\n'));
        assert_eq!(first, second, "http paginated fallback ignores is_first_page");
    }
}
