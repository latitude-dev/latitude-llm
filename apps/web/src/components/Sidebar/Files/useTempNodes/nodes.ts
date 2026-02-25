import { ModifiedDocumentType } from '@latitude-data/core/constants'
import { TempFileNode, TempFolderNode } from './types'

export const EMPTY_NAME = ' '

/**
 * Creates a stable temporary node id.
 */
export function generateTempNodeId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `tmp:${crypto.randomUUID()}`
  }

  return `tmp:${Math.random().toString(36).slice(2, 12)}`
}

/**
 * Creates a temporary folder node.
 */
export function createTempFolderNode({
  name,
  path,
  depth,
}: {
  name: string
  path: string
  depth: number
}): TempFolderNode {
  return {
    id: generateTempNodeId(),
    name,
    path,
    depth,
    isFile: false,
    changeType: ModifiedDocumentType.Created,
    children: [],
  }
}

/**
 * Creates a temporary file node.
 */
export function createTempFileNode({
  name,
  path,
  depth,
}: {
  name: string
  path: string
  depth: number
}): TempFileNode {
  return {
    id: generateTempNodeId(),
    name,
    path,
    depth,
    isFile: true,
    changeType: ModifiedDocumentType.Created,
    children: [],
  }
}
