import { database } from '../../client'
import { LatitudeEvent } from '../../events/handlers'
import { Result, Transaction } from '../../lib'
import { events } from '../../schema'

export async function createEvent(event: LatitudeEvent, db = database) {
  return Transaction.call(async (tx) => {
    const result = await tx
      .insert(events)
      .values({
        // TODO: uncomment this line when we are ready
        // workspaceId: event.data.workspaceId,
        type: event.type,
        data: event.data,
      })
      .returning()

    return Result.ok(result[0]!)
  }, db)
}
