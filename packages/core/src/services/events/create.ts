import { database } from '../../client'
import { LatitudeEvent } from '../../events/events'
import { Result } from '../../lib/Result'
import Transaction from './../../lib/Transaction'
import { events } from '../../schema'

export async function createEvent(event: LatitudeEvent, db = database) {
  return Transaction.call(async (tx) => {
    let workspaceId: number | undefined | null
    if ('workspaceId' in event.data) {
      workspaceId = event.data.workspaceId
    }

    const [createdEvent] = await tx
      .insert(events)
      .values({
        type: event.type,
        data: event.data,
        workspaceId,
      })
      .returning()

    if (!createdEvent) {
      throw new Error('Failed to create event')
    }

    return Result.ok(createdEvent)
  }, db)
}
