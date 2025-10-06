import { IncludedPrompt } from '$/components/BlocksEditor'
import { ROUTES } from '$/services/routes'
import type { ICommitContextType } from '$/app/providers/CommitProvider'
import type { IProjectContextType } from '$/app/providers/ProjectProvider'
import { useMemo } from 'react'
import { type DocumentVersion } from '@latitude-data/core/schema/types'
import { DocumentType } from '@latitude-data/core/constants'

const docUrl = (projectId: number, commitUuid: string, uuid: string) =>
  ROUTES.projects
    .detail({ id: projectId })
    .commits.detail({ uuid: commitUuid })
    .documents.detail({ uuid }).root

/**
 * This hook generates the prompts in the sidebar that:
 * 1. Are not the current document
 * 2. Are of type `DocumentType.Prompt`
 *
 * This is used for the blocks editor and does not makes sense to include
 * documents of type `DocumentType.Agent`
 */
export function useIncludabledPrompts({
  project,
  commit,
  document,
  documents,
}: {
  project: IProjectContextType['project']
  commit: ICommitContextType['commit']
  document: DocumentVersion
  documents: DocumentVersion[]
}) {
  return useMemo(() => {
    return documents
      .filter(
        (doc) =>
          doc.id !== document.id && doc.documentType === DocumentType.Prompt,
      )
      .reduce(
        (acc, doc) => {
          acc[doc.path] = {
            url: docUrl(project.id, commit.uuid, doc.documentUuid),
            id: doc.id,
            path: doc.path,
            projectId: project.id,
            commitUuid: commit.uuid,
            documentUuid: doc.documentUuid,
          }
          return acc
        },
        {} as Record<string, IncludedPrompt>,
      )
  }, [document, documents, project.id, commit.uuid])
}
