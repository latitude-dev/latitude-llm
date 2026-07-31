/**
 * Strings that redaction must never touch.
 *
 * Drawn from coding-agent telemetry, which is the traffic that decides detector precision:
 * tool output is full of SHAs, semver, ports, timestamps, UUIDs, base64 and file paths, and
 * every one of them is shaped enough to fool a careless pattern.
 *
 * Two consumers, and the second is why this is shipped code rather than a test fixture:
 *
 * 1. A regression guard over the built-in detectors. Their negative vectors are asserted
 *    per entity, so an edited detector can start eating another entity's negatives with
 *    nothing failing. Asserting the whole corpus against the whole default set closes that.
 * 2. Scoring customer-authored rules. A rule that matches entries here is almost always an
 *    accident, and saying which entries it hit is the only concrete feedback available
 *    before the rule starts destroying data.
 *
 * The corpus is asserted against `DEFAULT_REDACTION_ENTITIES`, not every entity. `ip_address`
 * matches version strings by design — that is precisely why it ships off — so asserting
 * immunity across all entities would be asserting something false.
 */
export const SAFE_CORPUS: readonly string[] = [
  // Package specifiers and module ids. The `@` plus dots reads as an address to a loose email pattern.
  "@types/node",
  "@babel/core is installed",
  "run npm i @scope/pkg",
  "react@18.2.0",
  "eslint@8.0.0-alpha",
  "node@lts",
  "foo@bar",
  "installed foo@1.2.beta",
  "npm install @scope/some-really-long-package-name-here",
  "@latitude-data/telemetry@3.7.0",
  "pnpm add -D vitest@^4.1.8",
  "resolved https://registry.npmjs.org/tslib/-/tslib-2.6.2.tgz",
  'import { Effect } from "effect"',
  "from '@domain/spans/otlp'",

  // Versions. Dotted numeric runs are the classic false-positive shape.
  "1.2.3",
  "v0.3.76",
  "20.11.0",
  "3.14159265358979",
  "0.000000000000001",
  "python 3.12.1",
  "openssl 3.0.13 30 Jan 2024",
  "turbo 2.9.18",
  "postgres 16.2 on aarch64-apple-darwin",
  "ClickHouse server version 24.3.1 revision 54465",

  // Git. Forty hex characters is a shape several credential forms share.
  "commit 0a1b2c3d4e5f60718293a4b5c6d7e8f901234567",
  "bb602023e release: v0.3.76",
  "HEAD detached at 2da4fa647",
  "origin/feature/custom-redaction-rules",
  "3 files changed, 277 insertions(+), 123 deletions(-)",
  "fatal: not a git repository (or any of the parent directories): .git",
  "Fast-forward\n packages/domain/spans/src/index.ts | 2 +-",
  "index 7f3a91c..e2b4d08 100644",

  // Dates and timestamps. `NNNN-NN-NN` is one separator away from an SSN.
  "2024-01-15",
  "2024-01-15T10:30:00Z",
  "2026-07-31T09:35:12.482Z",
  "1710590400200000000",
  "1710590400",
  "Wed Jul 31 09:35:12 2026 +0200",
  "duration 1.234s",
  "took 12345ms",
  "PT1H30M",

  // UUIDs and opaque ids.
  "9f473539-cdf0-486d-a0b0-c8c086dba8fd",
  "0af7651916cd43dd8448eb211c80319c",
  "a1b2c3d4e5f60001",
  "run_id=01HQ8P3ZK9WXYZ0123456789",
  "span_id 4bf92f3577b34da6",
  "trace 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",

  // Long numeric ids. These have to fail Luhn or the issuer gate, or they read as cards.
  "order 1234567890 shipped",
  "exit code 127",
  "5551234567",
  "id 9999999999999995",
  "pid 84213",
  "1234567890123456789012",
  "row 100000000000001",
  "offset 9007199254740991",
  "0.5",
  "-1",

  // Network. Ports and dotted quads are what `ip_address` deliberately over-matches.
  "localhost:3000",
  "127.0.0.1:5432",
  "192.168.1.100",
  "10.0.0.255",
  "http://localhost:3002/v1/traces",
  "0.0.0.0:8080",
  "listening on port 3000",
  "ECONNREFUSED 127.0.0.1:6379",
  "redis://localhost:6379/0",
  "clickhouse://default@localhost:8123/latitude",

  // URLs and query strings. A loose email local-part runs the match left through the path.
  "https://example.com/a/very/long/path/segment/that/goes/on",
  "https://docs.latitude.so/security/pii-redaction",
  "GET /v1/projects/my-project HTTP/1.1",
  "POST /v1/traces 200 12ms",
  "?cursor=eyJpZCI6MTIzfQ&limit=50",
  "https://api.openai.com/v1/chat/completions",
  "s3://latitude-ingest/tmp-ingest/org_1/proj_2/abc.protobuf",
  "file:///Users/dev/project/src/index.ts",

  // File paths. Slashes and dots in one token defeat several naive patterns.
  "/home/user/project/src/main.rs",
  "packages/domain/spans/src/redaction/detectors.ts",
  "C:\\Users\\dev\\AppData\\Local\\Temp\\build.log",
  "./node_modules/.bin/vitest",
  "~/.config/latitude/config.toml",
  "/var/log/nginx/access.log.1",
  "src/**/*.test.ts",
  "apps/web/src/routes/_authenticated/projects/$projectSlug/settings/privacy.tsx",

  // Hashes and digests.
  "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "md5 d41d8cd98f00b204e9800998ecf8427e",
  "integrity sha512-abc123DEF456ghi789JKL012mno345PQR678stu901vwx234yz==",
  'etag W/"686897696a7c876b7e"',
  "content_hash 8f14e45fceea167a5a36dedd4bea2543",

  // Base64 and encoded blobs, including the diff hunks an entropy heuristic would eat.
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8",
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
  "dGhlIHF1aWNrIGJyb3duIGZveCBqdW1wcyBvdmVyIHRoZSBsYXp5IGRvZw==",
  "@@ -1,4 +1,6 @@",
  "+  const ruleSet = compileRuleSet(policy)",
  "-  const entities = policy.entities",

  // Constants, env var names, and identifiers.
  "AWSACCESSKEYID123456",
  "CONSTANT_NAME_HERE",
  "ABCD1234EFGH5678IJKL",
  "LAT_REDACTION_PSEUDONYM_SECRET",
  "REDACTION_MAX_FIELD_CHARS",
  'process.env.NODE_ENV === "production"',
  "export const DEFAULT_REDACTION_ENTITIES",
  "SCREAMING_SNAKE_CASE_VALUE",

  // CSS and markup, where `sk-` prefixes are common.
  "sk-spinner-double-bounce-child",
  "sk-short",
  '<div class="flex flex-col gap-2">',
  "bg-muted/30 rounded-lg border-border",
  "--color-foreground-muted: oklch(0.55 0 0)",

  // Container and infra identifiers.
  "latitudedata/api:0.3.76",
  "ghcr.io/latitude-dev/latitude-staging-web:sha-2da4fa6",
  "docker compose up -d clickhouse redis",
  "kubectl -n latitude get pods",
  "arn:aws:s3:::latitude-ingest",
  "i-0abcd1234efgh5678",

  // Model, provider, and telemetry vocabulary.
  "gpt-4",
  "claude-opus-5",
  "claude-haiku-4-5-20251001",
  "gen_ai.input.messages",
  "llm.input_messages.0.message.content",
  "traceloop.association.properties.user_id",
  "service.name my-app",
  "operation chat provider openai",
  "tokens_input 1024 tokens_output 256",

  // Money and quantities, which sit next to card and account shapes.
  "$1,234.56",
  "1234 credits remaining",
  "spending limit 50000 cents",
  "99.9% uptime",
  "12 of 200 sampled",

  // Identifiers that look sensitive and are not.
  "ISBN 978-3-16-148410-0",
  "invoice INV-2024-000123",
  "PR #4312",
  "LAT-749",
  "ticket 12345",
  "issue-4306",

  // Pseudonyms. Redaction's own output must survive a second pass, and a customer rule that
  // eats these breaks the join that pseudonymization exists to preserve.
  "anon_3f9a2b7c1d4e5f60",
  "anon_0011223344556677",
  "[REDACTED_EMAIL]",
  "[REDACTED_OVERSIZED_FIELD]",
  "[REDACTED_USER]",

  // Terminal and log output.
  "Test Files  53 passed (53)",
  "Tests  1340 passed (1340)",
  "drwxr-xr-x  12 dev  staff   384 Jul 31 09:35 src",
  "ERROR [worker] span-ingestion job 4821 failed",
  "WARN  Redaction replaced oversized fields wholesale",
  "at Object.<anonymous> (/app/src/index.ts:42:15)",
  "TypeError: Cannot read properties of undefined (reading 'length')",
  "npm ERR! code ELIFECYCLE",
  "✓ src/redaction/rules.test.ts (6 tests) 3ms",

  // SQL and query fragments.
  "SELECT span_id FROM spans WHERE organization_id = {organizationId:String}",
  "ORDER BY ingested_at DESC LIMIT 1 BY span_id",
  "CREATE TABLE IF NOT EXISTS spans",
  "GROUP BY toStartOfHour(start_time)",
  "WHERE deleted_at IS NULL",

  // JSON payloads of the shape tool output actually carries.
  '{"status":"ok","count":42}',
  '{"id":"tool_01ABC","name":"Read"}',
  '{"userId": 4155552671}',
  '{"path":"/etc/hosts","lines":[1,2,3]}',
  '[{"role":"user"},{"role":"assistant"}]',

  // Prose that mentions sensitive categories without containing an instance.
  "Ask the user for their email address before continuing.",
  "The card on file was declined; retry with another payment method.",
  "Redaction is pattern based and does not catch names or addresses.",
  "Enter your social security number only on the official form.",
  "Phone support is available Monday to Friday.",

  // Near-miss structured identifiers. Each one fails a checksum or a range check on purpose.
  "4111111111111112",
  "41111111111111113",
  "411111111111116",
  "GB82WEST12345698765433",
  "000-45-6789",
  "666-45-6789",
  "900-45-6789",
  "123-00-6789",
  "123-45-0000",
  "123456789",
  "1234-56-7890",
]
