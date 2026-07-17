import { describe, expect, it } from "vitest"
import { buildHierarchicalClustersInWorker } from "./taxonomy-clustering-worker.ts"

describe("buildHierarchicalClustersInWorker", () => {
  it("runs clustering in a worker thread", async () => {
    const tree = await buildHierarchicalClustersInWorker({
      embeddings: [
        [1, 0],
        [0.95, 0.05],
        [0, 1],
        [0.05, 0.95],
      ],
      depthSchedule: [
        { maxChildren: 2, minClusterFraction: 0.25, minClusterAbs: 1, maxSiblingCosine: 0.99, minSplitScore: 0 },
      ],
      restarts: 1,
      maxIter: 5,
      tolerance: 1e-4,
      seed: 1,
    })

    expect(tree.memberIndices).toHaveLength(4)
    expect(tree.children).toHaveLength(2)
  })
})
