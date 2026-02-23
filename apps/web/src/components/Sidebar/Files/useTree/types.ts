import {
  DocumentType,
  ModifiedDocumentType,
} from '@latitude-data/core/constants'

export type SidebarDocument = {
  path: string
  documentUuid: string
  contentHash?: string | null
  documentType?: DocumentType
}

export type Node = {
  id: string
  parentId?: string
  name: string
  path: string
  isFile: boolean
  depth: number
  children: string[]
  documentUuid?: string
  contentHash?: string | null
  documentType?: DocumentType
  changeType?: ModifiedDocumentType
}

export type TreeNodesState = Map<string, Node>

export type BuildNextStateResult = {
  hasNodeStateChanges: boolean
  updatedNodesById: Map<string, Node>
  removedNodeIds: string[]
}
