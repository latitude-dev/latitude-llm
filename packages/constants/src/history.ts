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
