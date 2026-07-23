#!/usr/bin/env bash
#
# Datadog APM setup for the taxonomy adaptive shadow comparison.
# Creates the retention filter (100% keep of the shadow spans, which Datadog's
# default intelligent retention would otherwise only sample) and the span-based
# metrics (15-month durable history) over the taxonomy.gardenTaxonomyWorkflow.shadow
# span. Run this BEFORE enabling shadow in prod — neither is retroactive.
#
# Requires a Datadog API key and Application key (read/write APM config). They are
# read from the environment and never printed; do not paste them into shared logs.
#
#   DD_APP_KEY=xxx DD_API_KEY=yyy ./apps/workflows/datadog/setup-datadog.sh
#
# Idempotent: every object is deleted (if present) and recreated on each run, so
# re-running repairs a drifted definition instead of leaving the stale one in
# place. The span name lands in Datadog's `resource_name`, not `operation_name`.
# Site is datadoghq.eu.

set -euo pipefail
: "${DD_API_KEY:?set DD_API_KEY}" "${DD_APP_KEY:?set DD_APP_KEY}"

DD=https://api.datadoghq.eu/api/v2/apm/config
Q='service:workflows resource_name:taxonomy.gardenTaxonomyWorkflow.shadow'
RETENTION_FILTER_NAME='Taxonomy adaptive shadow spans'
HDR=(-H "DD-API-KEY: ${DD_API_KEY}" -H "DD-APPLICATION-KEY: ${DD_APP_KEY}" -H 'Content-Type: application/json')

FAILED=0
post() { # <url> <json>  — create; prints body + status; non-2xx records a failure
  local response status body
  response="$(curl -sS -X POST "$1" "${HDR[@]}" -d "$2" -w $'\n%{http_code}')"
  status="${response##*$'\n'}"
  body="${response%$'\n'*}"
  printf '%s\n-> HTTP %s\n' "${body}" "${status}"
  case "${status}" in
    2*) ;;
    *) FAILED=$((FAILED + 1)) ;;
  esac
}

del() { # <url>  — delete; 2xx or 404 (nothing to delete) ok, else records a failure
  local status
  status="$(curl -sS -o /dev/null -X DELETE "$1" "${HDR[@]}" -w '%{http_code}')"
  case "${status}" in
    2* | 404) ;;
    *) printf 'delete %s -> HTTP %s\n' "$1" "${status}"; FAILED=$((FAILED + 1)) ;;
  esac
}

echo "== retention filter =="
# Retention filters have no client-supplied id, so converge by deleting every
# filter that carries our name before recreating (avoids duplicates on rerun).
existing="$(curl -sS "${DD}/retention-filters" "${HDR[@]}" | python3 -c '
import sys, json
name = sys.argv[1]
for f in json.load(sys.stdin).get("data", []):
    if f.get("attributes", {}).get("name") == name:
        print(f["id"])
' "${RETENTION_FILTER_NAME}")"
for fid in ${existing}; do
  echo "-- deleting existing ${fid}"
  del "${DD}/retention-filters/${fid}"
done
post "${DD}/retention-filters" '{"data":{"type":"apm_retention_filter","attributes":{"name":"'"${RETENTION_FILTER_NAME}"'","filter_type":"spans-sampling-processor","filter":{"query":"'"${Q}"'"},"rate":1.0,"enabled":true}}}'

GRP='[{"path":"@taxonomy.projectId","tag_name":"project_id"},{"path":"@taxonomy.organizationId","tag_name":"organization_id"},{"path":"@taxonomy.customBehaviorId","tag_name":"custom_behavior_id"}]'

echo "== distribution span metrics =="
while IFS='|' read -r id path; do
  [ -z "${id}" ] && continue
  echo "-- ${id}"
  del "${DD}/metrics/${id}"
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
del "${DD}/metrics/taxonomy.adaptive.fallback"
post "${DD}/metrics" '{"data":{"type":"spans_metrics","id":"taxonomy.adaptive.fallback","attributes":{"compute":{"aggregation_type":"count"},"filter":{"query":"'"${Q}"' -@taxonomy.adaptive.fallbackReason:none"},"group_by":[{"path":"@taxonomy.projectId","tag_name":"project_id"},{"path":"@taxonomy.adaptive.fallbackReason","tag_name":"fallback_reason"}]}}}'

if [ "${FAILED}" -gt 0 ]; then
  echo "== ${FAILED} call(s) failed (non-2xx) — see statuses above =="
  exit 1
fi
echo "== done =="
