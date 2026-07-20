#!/usr/bin/env bash
#
# One-time Datadog APM setup for the taxonomy adaptive shadow comparison.
# Creates the retention filter (100% keep, 15-day indexing) and the span-based
# metrics (15-month durable history) over the taxonomy.gardenTaxonomyWorkflow.shadow
# span. Run this BEFORE enabling shadow in prod — neither is retroactive.
#
# Requires a Datadog API key and Application key (read/write APM config). They are
# read from the environment and never printed; do not paste them into shared logs.
#
#   DD_APP_KEY=xxx DD_API_KEY=yyy ./apps/workflows/datadog/setup-datadog.sh
#
# Idempotent-ish: re-running prints a 409 for anything that already exists and
# continues (each call prints its HTTP status). Site is datadoghq.eu.

set -euo pipefail
: "${DD_API_KEY:?set DD_API_KEY}" "${DD_APP_KEY:?set DD_APP_KEY}"

DD=https://api.datadoghq.eu/api/v2/apm/config
Q='service:workflows operation_name:taxonomy.gardenTaxonomyWorkflow.shadow'
HDR=(-H "DD-API-KEY: ${DD_API_KEY}" -H "DD-APPLICATION-KEY: ${DD_APP_KEY}" -H 'Content-Type: application/json')

post() { # <url> <json>  — prints response body + HTTP status, never aborts on 4xx
  curl -sS -X POST "$1" "${HDR[@]}" -d "$2" -w '\n-> HTTP %{http_code}\n'
}

echo "== retention filter =="
post "${DD}/retention-filters" '{"data":{"type":"apm_retention_filter","attributes":{"name":"Taxonomy adaptive shadow spans","filter_type":"spans-sampling-processor","filter":{"query":"'"${Q}"'"},"rate":"1.0","enabled":true}}}'

GRP='[{"path":"@taxonomy.projectId","tag_name":"project_id"},{"path":"@taxonomy.organizationId","tag_name":"organization_id"},{"path":"@taxonomy.customBehaviorId","tag_name":"custom_behavior_id"}]'

echo "== distribution span metrics =="
while IFS='|' read -r id path; do
  [ -z "${id}" ] && continue
  echo "-- ${id}"
  post "${DD}/metrics" '{"data":{"type":"spans_metrics","id":"'"${id}"'","attributes":{"compute":{"aggregation_type":"distribution","include_percentiles":true,"path":"'"${path}"'"},"filter":{"query":"'"${Q}"'"},"group_by":'"${GRP}"'}}}'
done <<'METRICS'
taxonomy.shadow.partition_ari|@taxonomy.shadow.diff.partitionAri
taxonomy.shadow.static_root_children|@taxonomy.shadow.static.rootChildCount
taxonomy.shadow.adaptive_root_children|@taxonomy.shadow.adaptive.rootChildCount
taxonomy.shadow.root_child_delta|@taxonomy.shadow.diff.rootChildDelta
taxonomy.adaptive.duration_ms|@taxonomy.adaptive.durationMs
taxonomy.adaptive.static_duration_ms|@taxonomy.adaptive.staticDurationMs
taxonomy.adaptive.peak_rss_bytes|@taxonomy.adaptive.peakRssBytes
taxonomy.adaptive.rel_sep_p50|@taxonomy.adaptive.relSep.p50
METRICS

echo "== fallback count metric =="
post "${DD}/metrics" '{"data":{"type":"spans_metrics","id":"taxonomy.adaptive.fallback","attributes":{"compute":{"aggregation_type":"count"},"filter":{"query":"'"${Q}"' -@taxonomy.adaptive.fallbackReason:none"},"group_by":[{"path":"@taxonomy.projectId","tag_name":"project_id"},{"path":"@taxonomy.adaptive.fallbackReason","tag_name":"fallback_reason"}]}}}'

echo "== done =="
