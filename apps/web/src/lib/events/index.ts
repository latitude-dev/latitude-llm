'use client'

import { type DependencyList, useEffect } from 'react'
import type { SubscriptionEvents, SubscriptionFn, TriggerFn } from './generics'
import type { Events } from './types'

export const on: SubscriptionFn = (eventType, callback) => {
  document.addEventListener(eventType, callback)
}

export const off: SubscriptionFn = (eventType, callback) => {
  // @ts-expect-error TypeScript thinks CustomEvent is not assignable to Event
  document.removeEventListener(eventType, callback)
}

export const trigger: TriggerFn = (type, detail) => {
  const event = new CustomEvent(type, { detail: detail || {} })
  document.dispatchEvent(event)
}

// To see subscribed events in the browser just go to dev tools and do:
// `getEventListeners(document)` You should see our custom events
// attached to `document`
export const useEvents = (
  events: SubscriptionEvents<Events>,
  deps: DependencyList = [],
) => {
  useEffect(() => {
    // Subscribe events
    const mappings = Object.keys(events).map((key: string) => {
      const eventType = key.replace(/^on/, '') as keyof Events
      const callback = (event: CustomEvent) => {
        const handler = events[key as keyof typeof events]
        handler?.(event.detail)
      }

      on(eventType, callback)

      return { eventType, callback }
    })

    // Unsubscribe events
    return () => {
      mappings.forEach((eventMapping) => {
        off(eventMapping.eventType, eventMapping.callback)
      })
    }
    // TODO: Remove events dependency
    /* eslint-disable react-hooks/exhaustive-deps */
  }, [events, ...deps])
}
