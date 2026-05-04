import type { FixtureRow } from "../types.ts"
import { mapJailbreakBench } from "./jailbreak/jailbreakbench.ts"

/**
 * Queue-level orchestrator for the `flaggers:jailbreaking` fixture. Composes
 * one or more upstream sources whose per-source mappers live under
 * `mappers/jailbreak/`. Each source returns a stable-ordered FixtureRow[];
 * this function concatenates them.
 *
 * v1: JailbreakBench only — its attack-artifacts repo (JBC manual + PAIR +
 * GCG) plus the JBB-Behaviors HF dataset (benign + harmful CSVs) cover all
 * three positive tactics in our queue's taxonomy and the soft + hard negative
 * splits. Phase 2 expansion (e.g. additional attack methods, gated WildChat
 * samples) lands as sibling files here.
 */
export async function mapJailbreaking(): Promise<FixtureRow[]> {
  return mapJailbreakBench()
}
