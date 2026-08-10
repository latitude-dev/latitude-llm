/**
 * Shapes the per-run adaptive garden telemetry. Pure (bar the resident-memory
 * reading) and separate from the activity so the emitted field set — what the
 * Datadog dashboard and its monitors read — is unit-testable.
 *
 * Everything here is bounded and embedding-free: scalars, fixed-width records,
 * and percentile summaries, never a raw per-split array, member id, or embedding.
 */

import type { HierarchicalTaxonomyPlan } from "@domain/taxonomy"
import { boundedPercentiles, TAXONOMY_ADAPTIVE_POLICY_VERSION } from "@domain/taxonomy"

/** The scope fields the events carry; a structural subset of `GardenTaxonomyStepInput`. */
export interface AdaptiveTelemetryScope {
  readonly organizationId: string
  readonly projectId: string
  readonly customBehaviorId?: string | undefined
}

/**
 * Log payload for one adaptive garden run. This goes to stdout → CloudWatch (the
 * workflows service does not forward logs to Datadog), so it is the un-sampled,
 * always-there record and a debugging breadcrumb alongside the rest of the
 * service's logs. The dashboard reads the span mirror below, which is sampled.
 */
export const adaptiveGardenRunFields = (scope: AdaptiveTelemetryScope, plan: HierarchicalTaxonomyPlan) => {
  const diagnostics = plan.decisionMetadata
  return {
    policyVersion: TAXONOMY_ADAPTIVE_POLICY_VERSION,
    mode: plan.mode,
    organizationId: scope.organizationId,
    projectId: scope.projectId,
    customBehaviorId: scope.customBehaviorId,
    observationsSampled: plan.observationsSampled,
    fallbackReason: plan.fallbackReason,
    adaptiveDurationMs: plan.adaptiveDurationMs,
    adaptiveBuildError: plan.adaptiveBuildError,
    staticDurationMs: plan.staticDurationMs,
    // Best-effort resident memory at plan time; worker threads share this process,
    // so the build's footprint is reflected here (see the clustering worker).
    peakRssBytes: process.memoryUsage().rss,
    rejectionReason: diagnostics?.rejectionReasonCounts,
    relativeSeparation: boundedPercentiles(diagnostics?.acceptedRelativeSeparations ?? []),
    nodeCount: diagnostics?.nodeCount ?? 0,
    leafCount: diagnostics?.leafCount ?? 0,
    maxDepth: diagnostics?.maxDepth ?? 0,
    selectedKByDepth: diagnostics?.selectedKByDepth,
    acceptedSplits: diagnostics?.acceptedSplits ?? 0,
    rejectedCandidates: diagnostics?.rejectedCandidates ?? 0,
    routingThreshold: boundedPercentiles(diagnostics?.routingThresholds ?? []),
    clustersBorn: plan.clustersBorn,
    clustersContinued: plan.clustersContinued,
    clustersDeprecated: plan.clustersDeprecated,
  }
}

/**
 * Flattened attributes for the APM span. Datadog span tags are flat scalars, so
 * nested diagnostics are dotted out. This is the channel the adaptive dashboard
 * actually reads: the app ships logs only to CloudWatch, but the workflows service
 * already exports these spans to Datadog APM.
 */
export const adaptiveSpanAttributes = (
  scope: AdaptiveTelemetryScope,
  plan: HierarchicalTaxonomyPlan,
): Record<string, string | number> => {
  const diagnostics = plan.decisionMetadata
  const relativeSeparation = boundedPercentiles(diagnostics?.acceptedRelativeSeparations ?? [])
  const routingThreshold = boundedPercentiles(diagnostics?.routingThresholds ?? [])
  const attributes: Record<string, string | number> = {
    "taxonomy.adaptive.policyVersion": TAXONOMY_ADAPTIVE_POLICY_VERSION,
    "taxonomy.adaptive.mode": plan.mode,
    "taxonomy.organizationId": scope.organizationId,
    "taxonomy.projectId": scope.projectId,
    "taxonomy.customBehaviorId": scope.customBehaviorId ?? "none",
    "taxonomy.adaptive.observationsSampled": plan.observationsSampled,
    "taxonomy.adaptive.fallbackReason": plan.fallbackReason ?? "none",
    // Carries the time a FAILED build burned as well as a successful one, so a
    // deadline breach is visible as a duration at the deadline rather than a 0.
    "taxonomy.adaptive.durationMs": plan.adaptiveDurationMs,
    "taxonomy.adaptive.buildError": plan.adaptiveBuildError ?? "none",
    // Non-zero only when static built the tree: `off`, or an adaptive run whose
    // output was rejected and fell back.
    "taxonomy.adaptive.staticDurationMs": plan.staticDurationMs,
    "taxonomy.adaptive.peakRssBytes": process.memoryUsage().rss,
    "taxonomy.adaptive.clustersBorn": plan.clustersBorn,
    "taxonomy.adaptive.clustersContinued": plan.clustersContinued,
    "taxonomy.adaptive.clustersDeprecated": plan.clustersDeprecated,
    "taxonomy.adaptive.relSep.p10": relativeSeparation.p10,
    "taxonomy.adaptive.relSep.p50": relativeSeparation.p50,
    "taxonomy.adaptive.relSep.p90": relativeSeparation.p90,
    "taxonomy.adaptive.routing.p10": routingThreshold.p10,
    "taxonomy.adaptive.routing.p50": routingThreshold.p50,
    "taxonomy.adaptive.routing.p90": routingThreshold.p90,
  }
  if (diagnostics) {
    attributes["taxonomy.adaptive.nodeCount"] = diagnostics.nodeCount
    attributes["taxonomy.adaptive.leafCount"] = diagnostics.leafCount
    attributes["taxonomy.adaptive.maxDepth"] = diagnostics.maxDepth
    attributes["taxonomy.adaptive.acceptedSplits"] = diagnostics.acceptedSplits
    attributes["taxonomy.adaptive.rejectedCandidates"] = diagnostics.rejectedCandidates
    attributes["taxonomy.adaptive.rejection.undersizedChild"] = diagnostics.rejectionReasonCounts.undersizedChild
    attributes["taxonomy.adaptive.rejection.dominantChild"] = diagnostics.rejectionReasonCounts.dominantChild
    attributes["taxonomy.adaptive.rejection.lowScore"] = diagnostics.rejectionReasonCounts.lowScore
    attributes["taxonomy.adaptive.rejection.lowRelativeSeparation"] =
      diagnostics.rejectionReasonCounts.lowRelativeSeparation
    // The quantity the root gate actually decides on, and whether it forced a
    // re-search. The relSep percentiles above cover accepted splits tree-wide, so
    // they say nothing about a run whose root collapsed.
    attributes["taxonomy.adaptive.bestRootSeparation"] = diagnostics.bestRootSeparation
    attributes["taxonomy.adaptive.escalated"] = diagnostics.escalated ? 1 : 0
    // A declined re-search reports the same tree as one that was never needed, so
    // without these two the work budget could suppress adaptive silently.
    attributes["taxonomy.adaptive.escalationSkipped"] = diagnostics.escalationSkipped ? 1 : 0
    attributes["taxonomy.adaptive.projectedRootSearchWork"] = diagnostics.projectedRootSearchWork
  }
  return attributes
}
