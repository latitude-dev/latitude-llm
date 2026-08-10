/**
 * Shapes the per-run adaptive garden telemetry, split out from the activity so the
 * emitted field set — the Datadog dashboard's contract — is unit-testable.
 *
 * Every value is bounded and embedding-free: scalars, fixed-width records, and
 * percentile summaries, never a raw per-split array, member id, or embedding.
 */

import type { HierarchicalTaxonomyPlan } from "@domain/taxonomy"
import { boundedPercentiles, TAXONOMY_ADAPTIVE_POLICY_VERSION } from "@domain/taxonomy"

/** The scope fields the events carry; a structural subset of `GardenTaxonomyStepInput`. */
export interface AdaptiveTelemetryScope {
  readonly organizationId: string
  readonly projectId: string
  readonly customBehaviorId?: string | undefined
}

/** Log payload for one adaptive garden run — CloudWatch only, so un-sampled unlike the span mirror below. */
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
    // A process-wide sample, not a per-build high-water mark, despite the name.
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

/** Flattened attributes for the APM span — Datadog span tags are flat scalars, so nested diagnostics are dotted out. */
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
    // A failed build reports the time it burned, so a deadline kill reads as a duration AT the deadline, not a 0.
    "taxonomy.adaptive.durationMs": plan.adaptiveDurationMs,
    "taxonomy.adaptive.buildError": plan.adaptiveBuildError ?? "none",
    // Non-zero only on a fallback run, the only time static builds the persisted tree.
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
    // The relSep percentiles cover accepted splits tree-wide, so they say nothing about a run whose root collapsed.
    attributes["taxonomy.adaptive.bestRootSeparation"] = diagnostics.bestRootSeparation
    attributes["taxonomy.adaptive.escalated"] = diagnostics.escalated ? 1 : 0
    // A declined re-search looks identical to one never needed, so without this the work budget suppresses adaptive silently.
    attributes["taxonomy.adaptive.escalationSkipped"] = diagnostics.escalationSkipped ? 1 : 0
    attributes["taxonomy.adaptive.projectedRootSearchWork"] = diagnostics.projectedRootSearchWork
  }
  return attributes
}
