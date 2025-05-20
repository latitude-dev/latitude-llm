/**
 * These types are used to define the structure of the data
 * that is sent and received by Latte tool calls.
 */

type LatteCreateSuggestion = {
  type: 'create'
  path: string
  content: string
}

type LatteUpdateSuggestion = {
  type: 'update'
  uuid: string
  path?: string
  content?: string
}

type LatteDeleteSuggestion = {
  type: 'delete'
  uuid: string
}

export type LatteSuggestion =
  | LatteCreateSuggestion
  | LatteUpdateSuggestion
  | LatteDeleteSuggestion

type BaseLatteDocument = {
  uuid: string
  path: string
}

type LatteDocumentListItem = BaseLatteDocument & {
  isAgent: boolean
}

export type LatteDocumentList = LatteDocumentListItem[]
export type LatteDocument = BaseLatteDocument & {
  content: string
}
