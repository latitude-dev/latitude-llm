'use client'

import { ROUTES } from '$/services/routes'
import { EvaluationType, EvaluationV2 } from '@latitude-data/core/constants'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { Project } from '@latitude-data/core/schema/models/types/Project'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { useCallback } from 'react'

export function useCompositeTargetToast({
  project,
  commit,
}: {
  project: Pick<Project, 'id'>
  commit: Pick<Commit, 'uuid'>
}) {
  const { toast } = useToast()

  return useCallback(
    ({
      evaluation,
      target,
    }: {
      evaluation: Pick<EvaluationV2, 'name'>
      target?: EvaluationV2<EvaluationType.Composite> & {
        action: string // 'create' | 'update' | 'delete'
      }
    }) => {
      if (!target) return

      const link =
        ROUTES.projects
          .detail({ id: project.id })
          .commits.detail({ uuid: commit.uuid })
          .documents.detail({ uuid: target.documentUuid })
          .evaluations.detail({ uuid: target.uuid }).root +
        '?action=editSettings'

      if (target.action === 'create') {
        return toast({
          title: `A new ${target.name} score has been created`,
          description: `from ${evaluation.name} evaluation`,
          href: link,
        })
      }

      if (target.action === 'update') {
        return toast({
          variant: 'warning',
          title: `${target.name} score needs to be updated`,
          description: `Add ${evaluation.name} evaluation to it`,
          href: link,
        })
      }

      if (target.action === 'delete') {
        return toast({
          variant: 'warning',
          title: `${target.name} score needs to be updated`,
          description: `Remove ${evaluation.name} evaluation from it`,
          href: link,
        })
      }
    },
    [project, commit, toast],
  )
}
