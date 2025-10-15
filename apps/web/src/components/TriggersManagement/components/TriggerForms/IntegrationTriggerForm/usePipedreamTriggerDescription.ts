import { useMemo } from 'react'
import {
  type PipedreamComponent,
  type PipedreamComponentType,
} from '@latitude-data/core/constants'
import { parseMarkdownLinks } from '$/components/Pipedream/utils'

export function useParsedPipedreamTriggerDescription({
  pipedreamTrigger,
}: {
  pipedreamTrigger?: PipedreamComponent<PipedreamComponentType.Trigger>
}) {
  return useMemo(
    () => parseMarkdownLinks(pipedreamTrigger?.description),
    [pipedreamTrigger?.description],
  )
}
