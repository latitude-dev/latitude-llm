import { useMemo } from 'react'
import {
  type PipedreamComponent,
  type PipedreamComponentType,
} from '@latitude-data/core/constants'

function parseMarkdownLinks(text: string | undefined) {
  if (!text) return ''
  return text.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    `<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>`,
  )
}

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
