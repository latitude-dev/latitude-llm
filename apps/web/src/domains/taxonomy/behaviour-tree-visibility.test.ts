import { describe, expect, it } from "vitest"
import { isOpenableBehaviourTree } from "./behaviour-tree-visibility.ts"

interface TestNode {
  readonly children: readonly TestNode[]
}

const node = (children: readonly TestNode[] = []): TestNode => ({ children })

describe("isOpenableBehaviourTree", () => {
  it("refuses an empty tree and a lone node", () => {
    expect(isOpenableBehaviourTree([])).toBe(false)
    expect(isOpenableBehaviourTree([node()])).toBe(false)
  })

  it("counts nested nodes, so a root with one child is openable", () => {
    // The rule is about total nodes, not roots: a root plus a child is a real
    // hierarchy, while two bare roots are two groups — both worth opening.
    expect(isOpenableBehaviourTree([node([node()])])).toBe(true)
    expect(isOpenableBehaviourTree([node(), node()])).toBe(true)
  })

  it("counts depth, not just breadth — a two-level chain clears the threshold", () => {
    expect(isOpenableBehaviourTree([node([node([node()])])])).toBe(true)
  })
})
