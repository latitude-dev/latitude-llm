import {
  DocumentType,
  ModifiedDocumentType,
} from '@latitude-data/core/constants'
import { Node } from './types'

/**
 * Creates a normalized tree node object for files and folders.
 */
export function createNode(attrs: {
  id: string
  parentId?: string
  name: string
  path: string
  isFile: boolean
  depth: number
  children?: string[]
  documentUuid?: string
  contentHash?: string | null
  documentType?: DocumentType
  changeType?: ModifiedDocumentType
}): Node {
  return {
    id: attrs.id,
    parentId: attrs.parentId,
    name: attrs.name,
    path: attrs.path,
    isFile: attrs.isFile,
    depth: attrs.depth,
    children: attrs.children ?? [],
    documentUuid: attrs.documentUuid,
    contentHash: attrs.contentHash,
    documentType: attrs.documentType,
    changeType: attrs.changeType,
  }
}

/**
 * Compares two string arrays by value and order.
 */
export function areStringArraysEqual(a: string[], b: string[]) {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}

/**
 * Sorts folders before files and then alphabetically by name.
 */
export function compareNodes(a: Node, b: Node) {
  if (a.isFile !== b.isFile) return a.isFile ? 1 : -1
  return a.name.localeCompare(b.name)
}

/**
 * Performs a stable equality check for node identity-sensitive updates.
 */
export function areNodesEqual(a: Node | undefined, b: Node) {
  if (!a) return false
  return (
    a.id === b.id &&
    a.parentId === b.parentId &&
    a.name === b.name &&
    a.path === b.path &&
    a.isFile === b.isFile &&
    a.depth === b.depth &&
    areStringArraysEqual(a.children, b.children) &&
    a.documentUuid === b.documentUuid &&
    a.contentHash === b.contentHash &&
    a.documentType === b.documentType &&
    a.changeType === b.changeType
  )
}
