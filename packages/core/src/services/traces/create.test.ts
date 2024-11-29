import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import type { Project } from '../../browser'
import { database } from '../../client'
import { traces } from '../../schema/models/traces'
import * as factories from '../../tests/factories'
import { createTrace } from './create'

describe('createTrace', () => {
  let project: Project

  beforeEach(async () => {
    const setup = await factories.createProject()
    project = setup.project
  })

  it('creates a trace', async () => {
    const traceId = '12345678901234567890123456789012' // 32 chars
    const startTime = new Date()
    const attributes = { foo: 'bar', count: 123, flag: true }

    const result = await createTrace({
      project,
      traceId,
      name: 'Test Trace',
      startTime,
      attributes,
      status: 'ok',
    })

    expect(result.error).toBeUndefined()
    const trace = result.value!

    expect(trace).toEqual(
      expect.objectContaining({
        id: expect.any(Number),
        projectId: project.id,
        traceId,
        name: 'Test Trace',
        startTime,
        attributes,
        status: 'ok',
      }),
    )

    // Verify trace was actually inserted in database
    const dbTrace = await database.query.traces.findFirst({
      where: eq(traces.id, trace.id),
    })

    expect(dbTrace).toBeDefined()
    expect(dbTrace?.projectId).toBe(project.id)
    expect(dbTrace?.traceId).toBe(traceId)
  })

  it('creates a trace with minimal required fields', async () => {
    const traceId = '12345678901234567890123456789012'
    const startTime = new Date()

    const result = await createTrace({
      project,
      traceId,
      startTime,
    })

    expect(result.error).toBeUndefined()
    const trace = result.value!

    expect(trace).toEqual(
      expect.objectContaining({
        projectId: project.id,
        traceId,
        startTime,
        name: null,
        attributes: null,
        status: null,
      }),
    )
  })

  it('fails if traceId is not unique', async () => {
    const traceId = '12345678901234567890123456789012'
    const startTime = new Date()

    // Create first trace
    await createTrace({
      project,
      traceId,
      startTime,
    })

    // Try to create second trace with same traceId
    const result = await createTrace({
      project,
      traceId,
      startTime,
    })

    expect(result.error).toBeDefined()
  })
})
