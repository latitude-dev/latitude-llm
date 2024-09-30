import { database } from '../../client'
import { LatitudeEvent } from '../../events/handlers'
import { Result, Transaction } from '../../lib'
import { events } from '../../schema'

export async function createEvent(event: LatitudeEvent, db = database) {
  return Transaction.call(async (tx) => {
    let workspaceId: number | undefined
    if ('workspaceId' in event.data) {
      workspaceId = event.data.workspaceId
    }

    const result = await tx
      .insert(events)
      .values({
        type: event.type,
        data: event.data,
        workspaceId,
      })
      .returning()

    return Result.ok(result[0]!)
  }, db)
}
