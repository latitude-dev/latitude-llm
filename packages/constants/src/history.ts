import { DocumentTriggerStatus, DocumentTriggerType } from '.'

export enum ModifiedDocumentType {
  Created = 'created',
  Updated = 'updated',
  UpdatedPath = 'updated_path',
  Deleted = 'deleted',
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

export type CommitChanges = {
  anyChanges: boolean
  hasIssues: boolean
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
}
