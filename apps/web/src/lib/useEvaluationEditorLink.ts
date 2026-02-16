import { useCallback } from 'react'
import { ROUTES } from '$/services/routes'

export function useEvaluationEditorLink({
  projectId,
  commitUuid,
  documentUuid,
}: {
  commitUuid: string
  projectId: number | string
  documentUuid: string
}) {
  return useCallback(
    ({
      evaluationUuid,
      documentLogUuid,
    }: {
      evaluationUuid: string
      documentLogUuid?: string
    }) => {
      const path = ROUTES.projects
        .detail({ id: +projectId })
        .commits.detail({ uuid: commitUuid })
        .documents.detail({ uuid: documentUuid })
        .evaluations.detail({ uuid: evaluationUuid }).editor.root

      if (!documentLogUuid) return path

      return path + `?logUuid=${documentLogUuid}`
    },
    [projectId, commitUuid, documentUuid],
  )
}
