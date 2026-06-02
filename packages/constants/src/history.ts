import { DocumentTriggerStatus, DocumentTriggerType } from '.'
import { EvaluationType } from './evaluations'

export enum ModifiedDocumentType {
  Created = 'created',
  Updated = 'updated',
  UpdatedPath = 'updated_path',
  Deleted = 'deleted',
  // The document's own content did not change; it shows up as changed only
  // because it references another prompt that did change.
  UpdatedByReference = 'updated_by_reference',
}

export type ChangedDocument = {
  documentUuid: string
  path: string
  errors: number
  changeType: ModifiedDocumentType
}

export type ChangedTrigger = {
  triggerUuid: string
  documentUuid: string
  triggerType: DocumentTriggerType
  changeType: ModifiedDocumentType
  status: DocumentTriggerStatus
}

export type ChangedEvaluation = {
  evaluationUuid: string
  documentUuid: string
  name: string
  type: EvaluationType
  changeType: ModifiedDocumentType
}

export type CommitChanges = {
  anyChanges: boolean
  hasIssues: boolean
  mainDocumentUuid: string | null | undefined // null if the main document was deleted, undefined if it did not change
  documents: {
    hasErrors: boolean
    all: ChangedDocument[]
    errors: ChangedDocument[]
    clean: ChangedDocument[]
  }
  triggers: {
    hasPending: boolean
    all: ChangedTrigger[]
    clean: ChangedTrigger[]
    pending: ChangedTrigger[]
  }
  evaluations: {
    all: ChangedEvaluation[]
  }
}
