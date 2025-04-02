'use client'

import { compact, flatten } from 'lodash-es'

import { EvaluationTemplateWithCategory } from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { createEvaluationTemplateAction } from '$/actions/evaluationTemplates/create'
import { destroyEvaluationTemplateAction } from '$/actions/evaluationTemplates/destroy'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'

export default function useEvaluationTemplates(
  opts: SWRConfiguration & { params?: Record<string, unknown> } = {},
) {
  const { toast } = useToast()
  const fetcher = useFetcher<EvaluationTemplateWithCategory[]>(
    ROUTES.api.evaluationTemplates.root,
  )

  const {
    data = [],
    mutate,
    ...rest
  } = useSWR<EvaluationTemplateWithCategory[]>(
    compact([
      'evaluationTemplates',
      ...flatten(Object.entries(opts?.params ?? {})),
    ]),
    fetcher,
    opts,
  )

  const { execute: create } = useLatitudeAction(
    createEvaluationTemplateAction,
    {
      onSuccess: ({ data: evaluationTemplate }) => {
        toast({
          title: `Evaluation ${evaluationTemplate.name} created`,
          description: 'The evaluation template has been created successfully',
        })

        mutate([...data, evaluationTemplate])
      },
    },
  )

  const { execute: destroy } = useLatitudeAction(
    destroyEvaluationTemplateAction,
    {
      onSuccess: ({ data: evaluationTemplate }) => {
        toast({
          title: `Evaluation ${evaluationTemplate.name} deleted`,
          description: 'The evaluation template has been deleted successfully',
        })

        mutate(data.filter((t) => t.id !== evaluationTemplate.id))
      },
    },
  )

  return {
    data,
    create,
    destroy,
    ...rest,
  }
}
