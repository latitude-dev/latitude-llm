# Taxonomy adaptive shadow — Datadog setup

The shadow comparison is emitted as attributes on the APM span
`taxonomy.gardenTaxonomyWorkflow.shadow` (service `workflows`). Application logs
go to CloudWatch, not Datadog, so the read path is APM spans. Do these **before**
enabling shadow in prod (`LAT_TAXONOMY_ADAPTIVE_CLUSTERING_MODE=shadow`), since
retention filters and span metrics are not retroactive.

Site: `datadoghq.eu`. All calls need `DD-API-KEY` + `DD-APPLICATION-KEY` headers.

## Gate 1 — ingestion (mostly handled in code)

The OTel SDK samples AlwaysOn, so the app exports 100% of spans to the DD agent.
The activity also sets `manual.keep` on the span, which tells the trace agent to
keep the low-volume garden trace chunk at ingestion. If agent-side sampling still
drops them, pin ingestion with an Ingestion Control rule (APM → Settings →
Ingestion Controls) keeping `service:workflows` at 100%.

## Gate 2 — retention filter (indexes ingested spans for 15 days)

`POST https://api.datadoghq.eu/api/v2/apm/config/retention-filters`

```json
{
  "data": {
    "type": "apm_retention_filter",
    "attributes": {
      "name": "Taxonomy adaptive shadow spans",
      "filter_type": "spans-sampling-processor",
      "filter": { "query": "service:workflows operation_name:taxonomy.gardenTaxonomyWorkflow.shadow" },
      "rate": "1.0",
      "enabled": true
    }
  }
}
```

This keeps 100% of the shadow spans, searchable/aggregatable in Trace Explorer
and the spans-source dashboard for 15 days.

## Durable history — span-based metrics (retained 15 months)

Indexed spans expire after 15 days; the decision window is ~1–2 weeks, so also
generate span metrics for durable, cheap aggregation (and so the dashboard can
optionally read `data_source: metrics` instead of raw spans).

`POST https://api.datadoghq.eu/api/v2/apm/config/metrics` — one call per metric.

Distribution metric (percentiles) — repeat with the `id`/`path` from the table:

```json
{
  "data": {
    "type": "spans_metrics",
    "id": "taxonomy.shadow.partition_ari",
    "attributes": {
      "compute": { "aggregation_type": "distribution", "include_percentiles": true, "path": "@taxonomy.shadow.diff.partitionAri" },
      "filter": { "query": "service:workflows operation_name:taxonomy.gardenTaxonomyWorkflow.shadow" },
      "group_by": [
        { "path": "@taxonomy.projectId", "tag_name": "project_id" },
        { "path": "@taxonomy.organizationId", "tag_name": "organization_id" },
        { "path": "@taxonomy.customBehaviorId", "tag_name": "custom_behavior_id" }
      ]
    }
  }
}
```

Fallback rate — a `count` metric over the fallback filter:

```json
{
  "data": {
    "type": "spans_metrics",
    "id": "taxonomy.adaptive.fallback",
    "attributes": {
      "compute": { "aggregation_type": "count" },
      "filter": { "query": "service:workflows operation_name:taxonomy.gardenTaxonomyWorkflow.shadow -@taxonomy.adaptive.fallbackReason:none" },
      "group_by": [
        { "path": "@taxonomy.projectId", "tag_name": "project_id" },
        { "path": "@taxonomy.adaptive.fallbackReason", "tag_name": "fallback_reason" }
      ]
    }
  }
}
```

Distribution metrics to create (all with the same `filter` + `group_by` as the first):

| metric `id`                             | `path`                                   |
| --------------------------------------- | ---------------------------------------- |
| `taxonomy.shadow.partition_ari`         | `@taxonomy.shadow.diff.partitionAri`     |
| `taxonomy.shadow.static_root_children`  | `@taxonomy.shadow.static.rootChildCount` |
| `taxonomy.shadow.adaptive_root_children`| `@taxonomy.shadow.adaptive.rootChildCount`|
| `taxonomy.shadow.root_child_delta`      | `@taxonomy.shadow.diff.rootChildDelta`   |
| `taxonomy.adaptive.duration_ms`         | `@taxonomy.adaptive.durationMs`          |
| `taxonomy.adaptive.static_duration_ms`  | `@taxonomy.adaptive.staticDurationMs`    |
| `taxonomy.adaptive.peak_rss_bytes`      | `@taxonomy.adaptive.peakRssBytes`        |
| `taxonomy.adaptive.rel_sep_p50`         | `@taxonomy.adaptive.relSep.p50`          |

## Order of operations

1. Create the retention filter (+ span metrics) — above.
2. Release the Phase-4 code to prod, then `pulumi up` to set
   `LAT_TAXONOMY_ADAPTIVE_CLUSTERING_MODE=shadow` (never the var before the code).
3. Trigger a garden run (or wait ~6h) → confirm spans via Trace Explorer:
   `service:workflows operation_name:taxonomy.gardenTaxonomyWorkflow.shadow`.
4. Apply `taxonomy-shadow-comparison-dashboard.json` with `upsert_datadog_dashboard`.
