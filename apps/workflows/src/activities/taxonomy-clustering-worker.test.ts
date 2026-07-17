import { describe, expect, it } from "vitest"
import { buildHierarchicalClustersInWorker } from "./taxonomy-clustering-worker.ts"

describe("buildHierarchicalClustersInWorker", () => {
  it("runs clustering in a worker thread and returns the tree with diagnostics", async () => {
    const { root, diagnostics } = await buildHierarchicalClustersInWorker({
      embeddings: [
        [1, 0],
        [0.95, 0.05],
        [0, 1],
        [0.05, 0.95],
      ],
      depthSchedule: [
        {
          maxChildren: 2,
          minClusterFraction: 0.25,
          minClusterAbs: 1,
          minSplitScore: 0,
          maxDominantChildFraction: 0.9,
          minRelativeSeparation: 0.1,
          withinDistanceQuantile: 0.8,
          routingSimilarityQuantile: 0.15,
        },
      ],
      restarts: 1,
      maxIter: 5,
      tolerance: 1e-4,
      seed: 1,
      globalAbsoluteThreshold: 0.65,
    })

    expect(root.memberIndices).toHaveLength(4)
    expect(root.children).toHaveLength(2)
    expect(diagnostics.acceptedSplits).toBe(1)
    expect(diagnostics.fellBackToStatic).toBe(false)
  })
})
