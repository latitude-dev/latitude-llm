import type { TraceEndSelectionSpec } from "@domain/spans"

import { LIVE_QUEUE_DEFAULT_SAMPLING } from "../constants.ts"
import type { AnnotationQueue } from "../entities/annotation-queue.ts"
import type { SystemQueueCacheEntry } from "./get-project-system-queues.ts"

export const buildLiveTraceEndQueueSelectionKey = (queueId: string) => `live-queue:${queueId}`

export const buildLiveTraceEndSystemQueueSelectionKey = (queueSlug: string) => `system-queue:${queueSlug}`

export const buildTraceEndLiveQueueSelectionInputs = (liveQueues: readonly AnnotationQueue[]) => {
  const liveQueueIdByKey = new Map<string, string>()
  const items = Object.create(null) as Record<string, TraceEndSelectionSpec>

  for (const queue of liveQueues) {
    const key = buildLiveTraceEndQueueSelectionKey(queue.id)
    liveQueueIdByKey.set(key, queue.id)
    items[key] = {
      sampling: queue.settings.sampling ?? LIVE_QUEUE_DEFAULT_SAMPLING,
      ...(queue.settings.filter ? { filter: queue.settings.filter } : {}),
      sampleKey: queue.id,
    }
  }

  return { liveQueueIdByKey, items }
}

export const buildTraceEndSystemQueueSelectionInputs = (systemQueues: readonly SystemQueueCacheEntry[]) => {
  const systemQueueByKey = new Map<string, SystemQueueCacheEntry>()
  const items = Object.create(null) as Record<string, TraceEndSelectionSpec>

  for (const queue of systemQueues) {
    const key = buildLiveTraceEndSystemQueueSelectionKey(queue.queueSlug)
    systemQueueByKey.set(key, queue)
    items[key] = {
      sampling: queue.sampling,
      sampleKey: queue.queueSlug,
    }
  }

  return { systemQueueByKey, items }
}
