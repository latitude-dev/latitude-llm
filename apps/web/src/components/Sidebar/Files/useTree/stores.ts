import { createStore } from 'zustand/vanilla'
import { createInitialNodesState } from './initial-state'
import { TreeNodesState } from './types'

/**
 * Holds per-node state keyed by node id.
 */
export const treeNodesStore = createStore<TreeNodesState>(() =>
  createInitialNodesState(),
)
