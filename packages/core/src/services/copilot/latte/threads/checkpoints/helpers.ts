import type { DocumentVersion, LatteThreadCheckpoint } from '../../../../../browser'

export function groupCheckpointsByCommitId(
  checkpoints: LatteThreadCheckpoint[],
): Record<number, LatteThreadCheckpoint[]> {
  return checkpoints.reduce(
    (acc, checkpoint) => {
      const commitId = checkpoint.commitId
      if (!acc[commitId]) {
        acc[commitId] = []
      }
      acc[commitId].push(checkpoint)
      return acc
    },
    {} as Record<number, LatteThreadCheckpoint[]>,
  )
}

export function getDocumentsFromCheckpoint({
  documents,
  checkpoints,
}: {
  documents: DocumentVersion[]
  checkpoints: LatteThreadCheckpoint[]
}): DocumentVersion[] {
  checkpoints.forEach(({ data: documentData, documentUuid }) => {
    if (!documentData) {
      // document did not exist in the checkpoint, so we remove it
      documents = documents.filter((doc) => doc.documentUuid !== documentUuid)
      return
    }

    const docIndex = documents.findIndex((doc) => doc.documentUuid === documentUuid)

    if (docIndex === -1) {
      // document did not exist in the checkpoint, so we add it
      documents.push(documentData as DocumentVersion)
      return
    }

    // document existed in the checkpoint, so we update it
    documents[docIndex] = documentData
  })

  return documents
}
