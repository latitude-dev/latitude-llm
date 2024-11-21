import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { Project } from '../../browser'
import { database } from '../../client'
import { traces } from '../../schema/models/traces'
import * as factories from '../../tests/factories'
import { bulkCreateTraces } from './bulkCreate'

describe('bulkCreateTraces', () => {
  let project: Project

  beforeEach(async () => {
    const setup = await factories.createProject()
    project = setup.project
  })

  it('creates multiple traces', async () => {
    const traceId1 = '12345678901234567890123456789012'
    const traceId2 = '98765432109876543210987654321098'
    const startTime = new Date()
    const attributes = { foo: 'bar', count: 123, flag: true }

    const result = await bulkCreateTraces({
      project,
      traces: [
        {
          traceId: traceId1,
          name: 'Test Trace 1',
          startTime,
          attributes,
          status: 'ok',
        },
        {
          traceId: traceId2,
          name: 'Test Trace 2',
          startTime,
          endTime: new Date(startTime.getTime() + 1000),
          attributes: { ...attributes, additional: 'value' },
          status: 'error',
        },
      ],
    })

    expect(result.error).toBeUndefined()
    const createdTraces = result.value!

    expect(createdTraces).toHaveLength(2)
    expect(createdTraces[0]).toEqual(
      expect.objectContaining({
        id: expect.any(Number),
        projectId: project.id,
        traceId: traceId1,
        name: 'Test Trace 1',
        startTime,
        attributes,
        status: 'ok',
      }),
    )
    expect(createdTraces[1]).toEqual(
      expect.objectContaining({
        id: expect.any(Number),
        projectId: project.id,
        traceId: traceId2,
        name: 'Test Trace 2',
        attributes: { ...attributes, additional: 'value' },
        status: 'error',
      }),
    )

    // Verify traces were actually inserted in database
    const dbTraces = await database.query.traces.findMany({
      where: eq(traces.projectId, project.id),
    })

    expect(dbTraces).toHaveLength(2)
    expect(dbTraces[0]?.traceId).toBe(traceId1)
    expect(dbTraces[1]?.traceId).toBe(traceId2)
  })

  it('creates traces with minimal required fields', async () => {
    const traceId1 = '12345678901234567890123456789012'
    const traceId2 = '98765432109876543210987654321098'
    const startTime = new Date()

    const result = await bulkCreateTraces({
      project,
      traces: [
        {
          traceId: traceId1,
          startTime,
        },
        {
          traceId: traceId2,
          startTime,
        },
      ],
    })

    expect(result.error).toBeUndefined()
    const createdTraces = result.value!

    expect(createdTraces).toHaveLength(2)
    expect(createdTraces[0]).toEqual(
      expect.objectContaining({
        projectId: project.id,
        traceId: traceId1,
        startTime,
        name: null,
        attributes: null,
        status: null,
      }),
    )
    expect(createdTraces[1]).toEqual(
      expect.objectContaining({
        projectId: project.id,
        traceId: traceId2,
        startTime,
        name: null,
        attributes: null,
        status: null,
      }),
    )
  })
})
