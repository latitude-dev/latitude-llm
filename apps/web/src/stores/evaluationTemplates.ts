'use client'

import { compact, flatten } from 'lodash-es'

import { EvaluationTemplateWithCategory } from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui'
import { createEvaluationTemplateAction } from '$/actions/evaluationTemplates/create'
import { destroyEvaluationTemplateAction } from '$/actions/evaluationTemplates/destroy'
import { fetchEvaluationTemplatesAction } from '$/actions/evaluationTemplates/fetch'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import useSWR, { SWRConfiguration } from 'swr'

export default function useEvaluationTemplates(
  opts: SWRConfiguration & { params?: Record<string, unknown> } = {},
) {
  const { toast } = useToast()

  const {
    data = [],
    mutate,
    ...rest
  } = useSWR<EvaluationTemplateWithCategory[]>(
    compact([
      'evaluationTemplates',
      ...flatten(Object.entries(opts?.params ?? {})),
    ]),
    async () => {
      const [data, error] = await fetchEvaluationTemplatesAction()

      if (error) {
        toast({
          title: 'Error fetching evaluation templates',
          description: error.formErrors?.[0] || error.message,
          variant: 'destructive',
        })
        throw error
      }

      return data
    },
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
