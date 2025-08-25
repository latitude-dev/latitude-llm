import type { Events } from './types'

declare global {
  interface Document {
    addEventListener<K extends keyof Events>(
      type: K,
      listener: (this: Document, ev: CustomEvent<Events[K]>) => void,
    ): void
  }
}

export type SubscriptionFn = <K extends keyof Events>(
  eventType: K,
  callback: (ev: CustomEvent<Events[K]>) => void,
) => void

export type TriggerFn = <EventType extends keyof Events>(
  event: EventType,
  detail?: Events[EventType],
) => void

export type SubscriptionEvents<T> = {
  [P in keyof T & string as `on${P}`]?: (detail: T[P]) => void
}
