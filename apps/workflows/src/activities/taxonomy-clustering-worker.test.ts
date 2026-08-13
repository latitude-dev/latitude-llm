import { describe, expect, it } from "vitest"
import { buildHierarchicalClustersInWorker } from "./taxonomy-clustering-worker.ts"

describe("buildHierarchicalClustersInWorker", () => {
  it("runs the static (off) build in a worker thread and returns no diagnostics", async () => {
    const { root, diagnostics } = await buildHierarchicalClustersInWorker({
      mode: "off",
      embeddings: [
        [1, 0],
        [0.95, 0.05],
        [0, 1],
        [0.05, 0.95],
      ],
      seed: 1,
    })

    expect(root.memberIndices).toHaveLength(4)
    expect(diagnostics).toBeNull()
  })

  it("runs the adaptive (enforced) build in a worker thread and returns diagnostics", async () => {
    // Two well-separated clusters with small within-cluster angular jitter, so
    // the within-distance is positive (a zero-spread cluster scores CH=0 and is
    // rejected) while the clusters stay clearly apart.
    const unit = (angle: number): number[] => [Math.cos(angle), Math.sin(angle)]
    const embeddings = Array.from({ length: 60 }, (_, index) =>
      index < 30 ? unit(0.05 * (index % 4)) : unit(Math.PI / 2 + 0.05 * (index % 4)),
    )
    const { root, diagnostics } = await buildHierarchicalClustersInWorker({ mode: "enforced", embeddings, seed: 1 })

    expect(root.memberIndices).toHaveLength(60)
    expect(root.children).toHaveLength(2)
    expect(diagnostics).not.toBeNull()
    expect(diagnostics?.acceptedSplits).toBeGreaterThanOrEqual(1)
  })
})
