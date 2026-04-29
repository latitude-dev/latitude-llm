import type { FixtureRow } from "../types.ts"
import { mapXstest } from "./refusal/xstest.ts"

/**
 * Queue-level orchestrator for the `flaggers:refusal` fixture. Composes one
 * or more upstream sources whose per-source mappers live under
 * `mappers/refusal/`. Each source returns a stable-ordered FixtureRow[];
 * this function concatenates them.
 *
 * v1: XSTest only. It is the only public refusal dataset that ships
 * (prompt + real assistant response + human refusal label) — every other
 * candidate (OR-Bench, PHTest, AdvBench, HarmBench) is prompt-only and would
 * require response synthesis before it could feed this queue.
 */
export async function mapRefusal(): Promise<FixtureRow[]> {
  return mapXstest()
}
