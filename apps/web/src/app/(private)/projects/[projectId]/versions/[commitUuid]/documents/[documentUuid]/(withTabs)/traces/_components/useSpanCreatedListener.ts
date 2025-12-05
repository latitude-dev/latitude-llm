import { useCallback } from 'react'
import {
  EventArgs,
  useSockets,
} from '$/components/Providers/WebsocketsProvider/useSockets'
import { serializeSpans } from '$/stores/spansKeysetPagination/utils'
import {
  SpansKeysetPaginationResult,
  useSpansKeysetPaginationStore,
} from '$/stores/spansKeysetPagination'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { KeyedMutator } from 'swr'

export function useSpanCreatedListener(
  spans: ReturnType<typeof useSpansKeysetPaginationStore>,
) {
  const { document } = useCurrentDocument()

  const onSpanCreated = useCallback(
    (args: EventArgs<'spanCreated'>) => {
      if (!args) return
      if (args.documentUuid !== document.documentUuid) return

      // Only add to list if we're on the first page (no cursor)
      const isFirstPage = !spans.currentCursor
      if (!isFirstPage) return

      const span = serializeSpans([args.span])[0]
      const mut = spans.mutate as KeyedMutator<SpansKeysetPaginationResult>
      mut(
        (prev) => {
          if (!prev) return prev

          // Check if span already exists (avoid duplicates)
          const exists = prev.items.some((s) => s.traceId === span.traceId)
          if (exists) return prev

          return {
            ...prev,
            items: [span, ...prev.items],
            count: prev.count ? prev.count + 1 : null,
          }
        },
        { revalidate: false },
      )
    },
    [document.documentUuid, spans.currentCursor, spans.mutate],
  )

  useSockets({ event: 'spanCreated', onMessage: onSpanCreated })
}
