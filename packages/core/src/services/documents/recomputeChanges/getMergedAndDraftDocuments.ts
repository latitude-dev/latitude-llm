import { DocumentVersion } from '../../../browser'

export function getMergedAndDraftDocuments({
  headDocuments,
  documentsInDrafCommit,
}: {
  headDocuments: DocumentVersion[]
  documentsInDrafCommit: DocumentVersion[]
}) {
  const mergedDocuments: DocumentVersion[] = headDocuments
  const draftDocuments = mergedDocuments
    .filter(
      (d) =>
        !documentsInDrafCommit.find((c) => c.documentUuid === d.documentUuid),
    )
    .concat(documentsInDrafCommit)

  return { mergedDocuments, draftDocuments }
}
