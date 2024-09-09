'use client'

import { compact, flatten } from 'lodash-es'

import type { EvaluationTemplateWithCategory } from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui'
import { fetchEvaluationTemplatesAction } from '$/actions/evaluationTemplates/fetch'
import useSWR, { SWRConfiguration } from 'swr'

export default function useEvaluationTemplates(
  opts: SWRConfiguration & { params?: Record<string, unknown> } = {},
) {
  const { toast } = useToast()

  const { data = [], ...rest } = useSWR<EvaluationTemplateWithCategory[]>(
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

  return {
    data,
    ...rest,
  }
}
