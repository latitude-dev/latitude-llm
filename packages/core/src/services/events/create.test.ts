import { describe, expect, it } from 'vitest'

import { database } from '../../client'
import { LatitudeEvent } from '../../events/handlers'
import { createEvent } from './create'

describe('createEvent', () => {
  it('creates an event in the database', async () => {
    const testEvent = {
      type: 'testEvent' as const,
      data: { foo: 'bar' },
    } as unknown as LatitudeEvent

    const result = await createEvent(testEvent)
    expect(result.ok).toBe(true)

    if (result.ok) {
      const createdEvent = result.value!
      expect(createdEvent.type).toBe(testEvent.type)
      expect(createdEvent.data).toEqual(testEvent.data)

      // Verify the event was actually inserted into the database
      const dbEvent = await database.query.events.findFirst({
        where: (events, { eq }) => eq(events.id, createdEvent.id),
      })

      expect(dbEvent).toBeDefined()
      expect(dbEvent?.type).toBe(testEvent.type)
      expect(dbEvent?.data).toEqual(testEvent.data)
    }
  })

  it('returns an error if the event creation fails', async () => {
    // Mock the database to simulate an error
    const mockDb = {
      ...database,
      insert: () => {
        throw new Error('Database error')
      },
    }

    const testEvent = {
      type: 'testEvent' as const,
      data: { foo: 'bar' },
    } as unknown as LatitudeEvent

    const result = await createEvent(testEvent, mockDb as any)
    expect(result.ok).toBe(false)
    expect(result.error).toBeDefined()
  })
})
