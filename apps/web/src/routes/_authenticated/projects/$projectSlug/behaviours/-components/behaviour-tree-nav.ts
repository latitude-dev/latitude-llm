import type {
  BehaviourNodeRecord,
  BehaviourTrajectoryMetric,
} from "../../../../../../domains/taxonomy/taxonomy.functions.ts"

export const isBehaviourTrajectoryMetric = (value: string): value is BehaviourTrajectoryMetric =>
  value === "frequency" || value === "escalation" || value === "resolution" || value === "churnRisk" || value === "wins"

export const findNodeByPath = (
  topics: readonly BehaviourNodeRecord[],
  path: readonly string[],
): { readonly node: BehaviourNodeRecord; readonly parent: BehaviourNodeRecord | null } | null => {
  let nodes = topics
  let parent: BehaviourNodeRecord | null = null
  let selected: { readonly node: BehaviourNodeRecord; readonly parent: BehaviourNodeRecord | null } | null = null
  for (const id of path) {
    const node = nodes.find((candidate) => candidate.cluster.id === id)
    if (!node) return null
    selected = { node, parent }
    nodes = node.children
    parent = node
  }
  return selected
}

export const findNodeById = (
  nodes: readonly BehaviourNodeRecord[],
  clusterId: string,
  parent: BehaviourNodeRecord | null = null,
): { readonly node: BehaviourNodeRecord; readonly parent: BehaviourNodeRecord | null } | null => {
  for (const node of nodes) {
    if (node.cluster.id === clusterId) return { node, parent }
    const found = findNodeById(node.children, clusterId, node)
    if (found) return found
  }
  return null
}
