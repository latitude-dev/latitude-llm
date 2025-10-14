'use client'

import { ReactNode, useEffect } from 'react'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { publishEventAction } from '$/actions/events/publishEventAction'

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
  const { execute: publishEvent } = useLatitudeAction(publishEventAction)

  useEffect(() => {
    const event = trackPageVisit({
      namePageVisited,
      additionalData,
    })

    if (event) {
      publishEvent({ eventType: event.type, payload: event.data })
    }
  }, [namePageVisited, additionalData, publishEvent])
  return children
}

export function trackPageVisit({
  namePageVisited,
  additionalData,
}: {
  namePageVisited: string
  additionalData?: Record<string, unknown>
}) {
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
