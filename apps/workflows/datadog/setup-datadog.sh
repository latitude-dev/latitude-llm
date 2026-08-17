#!/usr/bin/env bash
#
# Datadog APM setup for the taxonomy garden telemetry — two independent feature
# sets, converged together because they share credentials and both are missed
# just as easily:
#
#   1. Adaptive clustering rollout — the taxonomy.gardenTaxonomyWorkflow.shadow
#      span, emitted only for organizations the adaptiveTaxonomyClustering flag
#      has enabled. Run this BEFORE enabling the flag for an organization.
#   2. Tree quality (LAT-861 Build 4) — the .buildQuality and .nameQuality spans,
#      emitted for EVERY garden run of every project regardless of mode. Run this
#      BEFORE the Build 4 deploy, and before Builds 1-3 land, or their before/after
#      has no "before".
#   3. Assignment coverage (LAT-866) — the .assignmentCoverage span, also emitted
#      for every garden run in every mode. Run this BEFORE the fit-floor deploy.
#      The floor's cost is a coverage drop, so without this the change ships
#      unmeasured; the exact pre-change baseline comes from ClickHouse instead
#      (scripts/taxonomy/snapshot-assignment-baseline.ts), because the observation
#      rows behind it expire on the 30-day retention horizon.
#
# Neither retention filters nor span metrics are retroactive, which is why the
# ordering above matters. Each span name is load-bearing: the retention filter,
# the span metrics, and the dashboard widgets all key on it, so renaming a span
# orphans three objects at once and silently empties a dashboard.
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
BUILD_Q='service:workflows resource_name:taxonomy.gardenTaxonomyWorkflow.buildQuality'
NAME_Q='service:workflows resource_name:taxonomy.gardenTaxonomyWorkflow.nameQuality'
COVERAGE_Q='service:workflows resource_name:taxonomy.gardenTaxonomyWorkflow.assignmentCoverage'
# Also the keys this script converges on, so renaming one would leave the deployed
# filter behind and create a duplicate.
RETENTION_FILTER_NAME='Taxonomy adaptive shadow spans'
QUALITY_RETENTION_FILTER_NAME='Taxonomy quality spans'
COVERAGE_RETENTION_FILTER_NAME='Taxonomy assignment coverage spans'
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

retention_filter() { # <name> <query>  — 100%-keep filter, converged by name
  # Retention filters have no client-supplied id, so converge by deleting every
  # filter that carries our name before recreating (avoids duplicates on rerun).
  local existing fid
  existing="$(curl -sS "${DD}/retention-filters" "${HDR[@]}" | python3 -c '
import sys, json
name = sys.argv[1]
for f in json.load(sys.stdin).get("data", []):
    if f.get("attributes", {}).get("name") == name:
        print(f["id"])
' "$1")"
  for fid in ${existing}; do
    echo "-- deleting existing ${fid}"
    del "${DD}/retention-filters/${fid}"
  done
  post "${DD}/retention-filters" '{"data":{"type":"apm_retention_filter","attributes":{"name":"'"$1"'","filter_type":"spans-sampling-processor","filter":{"query":"'"$2"'"},"rate":1.0,"enabled":true}}}'
}

echo "== retention filter (adaptive) =="
retention_filter "${RETENTION_FILTER_NAME}" "${Q}"

echo "== retention filter (quality) =="
# One filter over both quality spans: they are read together and a single object
# is one ordering problem instead of two (filters are evaluated top-down and the
# first match decides, so a broad catch-all above this one would sample it out).
retention_filter "${QUALITY_RETENTION_FILTER_NAME}" \
  'service:workflows resource_name:(taxonomy.gardenTaxonomyWorkflow.buildQuality OR taxonomy.gardenTaxonomyWorkflow.nameQuality)'

GRP='[{"path":"@taxonomy.projectId","tag_name":"project_id"},{"path":"@taxonomy.organizationId","tag_name":"organization_id"},{"path":"@taxonomy.customBehaviorId","tag_name":"custom_behavior_id"}]'

echo "== distribution span metrics =="
while IFS='|' read -r id path; do
  [ -z "${id}" ] && continue
  echo "-- ${id}"
  del "${DD}/metrics/${id}"
  post "${DD}/metrics" '{"data":{"type":"spans_metrics","id":"'"${id}"'","attributes":{"compute":{"aggregation_type":"distribution","include_percentiles":true,"path":"'"${path}"'"},"filter":{"query":"'"${Q}"'"},"group_by":'"${GRP}"'}}}'
done <<'METRICS'
taxonomy.adaptive.duration_ms|@taxonomy.adaptive.durationMs
taxonomy.adaptive.static_duration_ms|@taxonomy.adaptive.staticDurationMs
taxonomy.adaptive.peak_rss_bytes|@taxonomy.adaptive.peakRssBytes
taxonomy.adaptive.rel_sep_p50|@taxonomy.adaptive.relSep.p50
METRICS

echo "== fallback count metric =="
del "${DD}/metrics/taxonomy.adaptive.fallback"
post "${DD}/metrics" '{"data":{"type":"spans_metrics","id":"taxonomy.adaptive.fallback","attributes":{"compute":{"aggregation_type":"count"},"filter":{"query":"'"${Q}"' -@taxonomy.adaptive.fallbackReason:none"},"group_by":[{"path":"@taxonomy.projectId","tag_name":"project_id"},{"path":"@taxonomy.adaptive.fallbackReason","tag_name":"fallback_reason"}]}}}'

# Quality spans carry the facet too, so views are separable from the topic tree.
QUALITY_GRP='[{"path":"@taxonomy.projectId","tag_name":"project_id"},{"path":"@taxonomy.organizationId","tag_name":"organization_id"},{"path":"@taxonomy.customBehaviorId","tag_name":"custom_behavior_id"},{"path":"@taxonomy.facetId","tag_name":"facet_id"}]'

# Span metrics are computed at ingestion, so these keep accruing regardless of what
# the retention filter above indexes — they are the channel that outlives the
# 15-day span window and carries the before/after for Builds 1-3.
echo "== build quality span metrics =="
while IFS='|' read -r id path; do
  [ -z "${id}" ] && continue
  echo "-- ${id}"
  del "${DD}/metrics/${id}"
  post "${DD}/metrics" '{"data":{"type":"spans_metrics","id":"'"${id}"'","attributes":{"compute":{"aggregation_type":"distribution","include_percentiles":true,"path":"'"${path}"'"},"filter":{"query":"'"${BUILD_Q}"'"},"group_by":'"${QUALITY_GRP}"'}}}'
done <<'METRICS'
taxonomy.quality.largest_leaf_share|@taxonomy.quality.largestLeafShare
taxonomy.quality.largest_top_level_share|@taxonomy.quality.largestTopLevelShare
taxonomy.quality.top_level_row_count|@taxonomy.quality.topLevelRowCount
taxonomy.quality.leaf_count|@taxonomy.quality.leafCount
taxonomy.quality.members_clustered|@taxonomy.quality.membersClustered
taxonomy.quality.centered_cohesion_min|@taxonomy.quality.centeredCohesion.min
taxonomy.quality.centered_cohesion_p50|@taxonomy.quality.centeredCohesion.p50
METRICS

echo "== name quality span metrics =="
while IFS='|' read -r id path; do
  [ -z "${id}" ] && continue
  echo "-- ${id}"
  del "${DD}/metrics/${id}"
  post "${DD}/metrics" '{"data":{"type":"spans_metrics","id":"'"${id}"'","attributes":{"compute":{"aggregation_type":"distribution","include_percentiles":true,"path":"'"${path}"'"},"filter":{"query":"'"${NAME_Q}"'"},"group_by":'"${QUALITY_GRP}"'}}}'
done <<'METRICS'
taxonomy.quality.duplicate_name_rate|@taxonomy.quality.duplicateNameRate
taxonomy.quality.cross_branch_duplicates|@taxonomy.quality.crossBranchDuplicateLeafCount
taxonomy.quality.shared_sibling_word_share|@taxonomy.quality.sharedSiblingWordShare
taxonomy.quality.near_duplicate_name_rate|@taxonomy.quality.nearDuplicateNameRate
METRICS

echo "== retention filter (assignment coverage) =="
retention_filter "${COVERAGE_RETENTION_FILTER_NAME}" "${COVERAGE_Q}"

# Grouped by the arm as well as the scope: `routed_full_window` separates the
# projects the reassignment floor moved from the ones only the online gate moved,
# which `mode` does NOT — an enforced run that fell back to static takes the
# sample-only path and would otherwise be pooled with adaptive.
COVERAGE_GRP='[{"path":"@taxonomy.projectId","tag_name":"project_id"},{"path":"@taxonomy.organizationId","tag_name":"organization_id"},{"path":"@taxonomy.coverage.routedFullWindow","tag_name":"routed_full_window"},{"path":"@taxonomy.coverage.fitFloor","tag_name":"fit_floor"}]'

echo "== assignment coverage span metrics =="
while IFS='|' read -r id path; do
  [ -z "${id}" ] && continue
  echo "-- ${id}"
  del "${DD}/metrics/${id}"
  post "${DD}/metrics" '{"data":{"type":"spans_metrics","id":"'"${id}"'","attributes":{"compute":{"aggregation_type":"distribution","include_percentiles":true,"path":"'"${path}"'"},"filter":{"query":"'"${COVERAGE_Q}"'"},"group_by":'"${COVERAGE_GRP}"'}}}'
done <<'METRICS'
taxonomy.coverage.assigned_share|@taxonomy.coverage.assignedShare
taxonomy.coverage.window_total|@taxonomy.coverage.windowTotal
taxonomy.coverage.window_assigned|@taxonomy.coverage.windowAssigned
taxonomy.coverage.window_noise|@taxonomy.coverage.windowNoise
taxonomy.coverage.observations_rejected|@taxonomy.coverage.observationsRejected
taxonomy.coverage.observations_reassigned|@taxonomy.coverage.observationsReassigned
METRICS

echo "== retired shadow-comparison metrics =="
# The paired static-vs-adaptive attributes are no longer emitted (LAT-774), so these
# metrics would sit at no-data forever. Deleted here rather than dropped from the
# list above, which would leave them in Datadog.
for id in \
  taxonomy.shadow.partition_ari \
  taxonomy.shadow.static_root_children \
  taxonomy.shadow.adaptive_root_children \
  taxonomy.shadow.root_child_delta; do
  del "${DD}/metrics/${id}"
done

if [ "${FAILED}" -gt 0 ]; then
  echo "== ${FAILED} call(s) failed (non-2xx) — see statuses above =="
  exit 1
fi
echo "== done =="
