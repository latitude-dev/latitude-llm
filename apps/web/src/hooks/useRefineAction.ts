import { useCallback } from 'react'

import { Commit, DocumentVersion, Project } from '@latitude-data/core/browser'
import { CheckedState } from '@latitude-data/web-ui'
import { ROUTES } from '$/services/routes'
import { useRouter } from 'next/navigation'

export type OnCheckRefineFn = (id: number) => (checked: CheckedState) => void

export function useRefineAction({
  project,
  commit,
  document,
  getSelectedRowIds,
}: {
  project: Pick<Project, 'id'>
  commit: Pick<Commit, 'uuid'>
  document: DocumentVersion
  getSelectedRowIds: () => number[]
}) {
  const navigate = useRouter()
  const onClickRefine = useCallback(() => {
    const route = ROUTES.projects
      .detail({ id: project.id })
      .commits.detail({
        uuid: commit.uuid,
      })
      .documents.detail({ uuid: document.documentUuid }).root
    const resultIds = getSelectedRowIds()
    const idsQuery = resultIds.map((id) => `reval=${id}`).join('&')

    navigate.push(`${route}?${idsQuery}`)
  }, [
    getSelectedRowIds,
    navigate,
    project.id,
    commit.uuid,
    document.documentUuid,
  ])

  return onClickRefine
}
