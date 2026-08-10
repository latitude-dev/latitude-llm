/**
 * When a behavior's tree is worth opening.
 *
 * A single-node tree restates the whole project, so the tree screen renders
 * nothing for it (#3642). Every surface that offers a way INTO a tree has to
 * agree with that, or it sends people to an empty page — which is what the
 * Behaviors catalog did: a card teased the one group it found and clicking it
 * landed on "No behaviors yet".
 *
 * Structural node shape, so this applies to both the domain read
 * (`ProjectBehaviourNode`) and the web record (`BehaviourNodeRecord`).
 */
const BEHAVIOUR_TREE_MIN_NODES = 2

interface BehaviourTreeNodeLike {
  readonly children: readonly BehaviourTreeNodeLike[]
}

const countBehaviourTreeNodes = (nodes: readonly BehaviourTreeNodeLike[]): number =>
  nodes.reduce((sum, node) => sum + 1 + countBehaviourTreeNodes(node.children), 0)

export const isOpenableBehaviourTree = (nodes: readonly BehaviourTreeNodeLike[]): boolean =>
  countBehaviourTreeNodes(nodes) >= BEHAVIOUR_TREE_MIN_NODES
