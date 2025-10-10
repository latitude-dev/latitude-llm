'use client'

import { ReactNode, useEffect } from 'react'
import { publishEventAction } from '$/actions/events/publishEventAction'
import { LatitudeEvent } from '@latitude-data/core/events/events.d'

type Props = {
  namePageVisited: string
  additionalData?: Record<string, unknown>
  children: ReactNode
}

export function PageTrackingWrapper({
  namePageVisited,
  additionalData,
  children,
}: Props) {
  useEffect(() => {
    const event = trackPageVisit({
      namePageVisited,
      additionalData,
    })

    if (event) {
      publishEventAction({ eventType: event.type, payload: event.data })
    }
  }, [namePageVisited, additionalData])
  return children
}

export function trackPageVisit({
  namePageVisited,
  additionalData,
}: {
  namePageVisited: string
  additionalData?: Record<string, unknown>
}): LatitudeEvent | null {
  const sessionKey = `${namePageVisited}PageVisited`
  // Using sessionStorage to avoid tracking the same page twice in the same session
  const hasVisited = sessionStorage.getItem(sessionKey)

  if (hasVisited) {
    return null // Already tracked in this session
  }

  sessionStorage.setItem(sessionKey, 'true')

  return {
    type: sessionKey,
    data: {
      ...additionalData,
    },
  }
}
