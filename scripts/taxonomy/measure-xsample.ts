#!/usr/bin/env tsx
/**
 * Print the averaged cross-sample ARI (mean over all 45 leave-one-tenth-out fold
 * pairs) for every synthetic calibration fixture. Use this to re-derive
 * ADAPTIVE_CROSS_SAMPLE_ARI_FLOOR after a builder or schedule change: the floor
 * sits below the worst fixture here, with headroom (see BASELINES.md).
 *
 *   pnpm --filter @app/workers exec tsx scripts/taxonomy/measure-xsample.ts
 */
import { buildAllQualityFixtures } from "../../packages/domain/taxonomy/src/calibration/fixtures.ts"
import { crossSampleAri } from "../../packages/domain/taxonomy/src/calibration/harness.ts"

for (const corpus of buildAllQualityFixtures()) {
  console.log(
    `${corpus.name.padEnd(24)} xSample(avg)=${crossSampleAri(corpus).toFixed(3)}  (n=${corpus.embeddings.length}, ${corpus.dimensions}d)`,
  )
}
