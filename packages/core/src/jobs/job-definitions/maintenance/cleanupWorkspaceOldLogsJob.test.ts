import { providerLogs } from '../../../schema/models/providerLogs'
import { spans } from '../../../schema/models/spans'
import { Job } from 'bullmq'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanupWorkspaceOldLogsJob } from './cleanupWorkspaceOldLogsJob'
import * as factories from '../../../tests/factories'
import { database } from '../../../client'
import { eq } from 'drizzle-orm'
import { LogSources, Providers } from '@latitude-data/constants'
import { SubscriptionPlan } from '../../../plans'
import { updateWorkspace } from '../../../services/workspaces'
import { v4 as uuid } from 'uuid'
import { Workspace } from '../../../schema/models/types/Workspace'
import { ProviderApiKey } from '../../../schema/models/types/ProviderApiKey'

const NOW = new Date('2025-01-15T12:00:00Z')
const TWENTY_NINE_DAYS_AGO = new Date('2024-12-17T12:00:00Z')
const TWENTY_NINE_AND_HALF_DAYS_AGO = new Date('2024-12-17T00:00:00Z')
const THIRTY_ONE_DAYS_AGO = new Date('2024-12-15T12:00:00Z')
const EIGHTY_NINE_DAYS_AGO = new Date('2024-10-18T12:00:00Z')
const NINETY_ONE_DAYS_AGO = new Date('2024-10-16T12:00:00Z')

function freezeTime() {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
}

describe('cleanupWorkspaceOldLogsJob', () => {
  let workspace1: Workspace
  let workspace2: Workspace
  let provider1: ProviderApiKey
  let provider2: ProviderApiKey

  beforeEach(async () => {
    const projectData1 = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'OpenAI1' }],
      documents: {
        test: factories.helpers.createPrompt({ provider: 'OpenAI1' }),
      },
    })
    workspace1 = projectData1.workspace
    provider1 = projectData1.providers[0]

    const projectData2 = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'OpenAI2' }],
      documents: {
        test: factories.helpers.createPrompt({ provider: 'OpenAI2' }),
      },
    })
    workspace2 = projectData2.workspace
    provider2 = projectData2.providers[0]
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('deletes old spans and associated provider logs from the correct workspace', async () => {
    const oldDocLogUuid1 = uuid()
    const oldDocLogUuid2 = uuid()
    const recentDocLogUuid = uuid()
    const oldDocLogUuidWorkspace2 = uuid()

    await factories.createSpan({
      workspaceId: workspace1.id,
      documentLogUuid: oldDocLogUuid1,
      startedAt: THIRTY_ONE_DAYS_AGO,
    })

    await factories.createSpan({
      workspaceId: workspace1.id,
      documentLogUuid: oldDocLogUuid2,
      startedAt: THIRTY_ONE_DAYS_AGO,
    })

    const recentSpan = await factories.createSpan({
      workspaceId: workspace1.id,
      documentLogUuid: recentDocLogUuid,
      startedAt: TWENTY_NINE_DAYS_AGO,
    })

    const oldSpanWorkspace2 = await factories.createSpan({
      workspaceId: workspace2.id,
      documentLogUuid: oldDocLogUuidWorkspace2,
      startedAt: THIRTY_ONE_DAYS_AGO,
    })

    await factories.createProviderLog({
      documentLogUuid: oldDocLogUuid1,
      providerId: provider1.id,
      providerType: provider1.provider,
      workspace: workspace1,
    })

    await factories.createProviderLog({
      documentLogUuid: oldDocLogUuid2,
      providerId: provider1.id,
      providerType: provider1.provider,
      workspace: workspace1,
    })

    await factories.createProviderLog({
      documentLogUuid: recentDocLogUuid,
      providerId: provider1.id,
      providerType: provider1.provider,
      workspace: workspace1,
    })

    await factories.createProviderLog({
      documentLogUuid: oldDocLogUuidWorkspace2,
      providerId: provider2.id,
      providerType: provider2.provider,
      workspace: workspace2,
    })

    freezeTime()

    const mockJob = {
      data: { workspaceId: workspace1.id, batchSize: 1 },
    } as Job<{ workspaceId: number; batchSize: number }>

    await cleanupWorkspaceOldLogsJob(mockJob)

    const remainingSpansWorkspace1 = await database
      .select()
      .from(spans)
      .where(eq(spans.workspaceId, workspace1.id))

    expect(remainingSpansWorkspace1.length).toBe(1)
    expect(remainingSpansWorkspace1[0]!.id).toBe(recentSpan.id)

    const remainingSpansWorkspace2 = await database
      .select()
      .from(spans)
      .where(eq(spans.workspaceId, workspace2.id))

    expect(remainingSpansWorkspace2.length).toBe(1)
    expect(remainingSpansWorkspace2[0]!.id).toBe(oldSpanWorkspace2.id)

    const remainingProviderLogsWorkspace1 = await database
      .select()
      .from(providerLogs)
      .where(eq(providerLogs.workspaceId, workspace1.id))

    expect(remainingProviderLogsWorkspace1.length).toBe(1)
    expect(remainingProviderLogsWorkspace1[0]!.documentLogUuid).toBe(
      recentDocLogUuid,
    )

    const remainingProviderLogsWorkspace2 = await database
      .select()
      .from(providerLogs)
      .where(eq(providerLogs.workspaceId, workspace2.id))

    expect(remainingProviderLogsWorkspace2.length).toBe(1)
  })

  it('does not delete provider logs without associated spans', async () => {
    const orphanedDocLogUuid = uuid()

    await database.insert(providerLogs).values({
      uuid: uuid(),
      workspaceId: workspace1.id,
      documentLogUuid: orphanedDocLogUuid,
      providerId: provider1.id,
      model: 'gpt-4o',
      source: LogSources.API,
      createdAt: THIRTY_ONE_DAYS_AGO,
    })

    await database.insert(providerLogs).values({
      uuid: uuid(),
      workspaceId: workspace1.id,
      documentLogUuid: null,
      providerId: provider1.id,
      model: 'gpt-4o',
      source: LogSources.API,
      createdAt: THIRTY_ONE_DAYS_AGO,
    })

    freezeTime()

    const mockJob = {
      data: { workspaceId: workspace1.id },
    } as Job

    await cleanupWorkspaceOldLogsJob(mockJob)

    const remainingProviderLogs = await database
      .select()
      .from(providerLogs)
      .where(eq(providerLogs.workspaceId, workspace1.id))

    expect(remainingProviderLogs.length).toBe(2)
  })

  describe('unlimited retention plans', () => {
    it('does not delete data for enterprise plan', async () => {
      const sub = await factories.createSubscription({
        workspaceId: workspace1.id,
        plan: SubscriptionPlan.EnterpriseV1,
      })
      await updateWorkspace(workspace1, { currentSubscriptionId: sub.id })

      const oldSpan = await factories.createSpan({
        workspaceId: workspace1.id,
        startedAt: THIRTY_ONE_DAYS_AGO,
      })

      freezeTime()

      const mockJob = {
        data: { workspaceId: workspace1.id },
      } as Job

      await cleanupWorkspaceOldLogsJob(mockJob)

      const remainingSpans = await database
        .select()
        .from(spans)
        .where(eq(spans.workspaceId, workspace1.id))

      expect(remainingSpans.length).toBe(1)
      expect(remainingSpans[0]!.id).toBe(oldSpan.id)
    })

    it('does not delete data for scale plan', async () => {
      const sub = await factories.createSubscription({
        workspaceId: workspace1.id,
        plan: SubscriptionPlan.ScaleV1,
      })
      await updateWorkspace(workspace1, { currentSubscriptionId: sub.id })

      const oldSpan = await factories.createSpan({
        workspaceId: workspace1.id,
        startedAt: THIRTY_ONE_DAYS_AGO,
      })

      freezeTime()

      const mockJob = {
        data: { workspaceId: workspace1.id },
      } as Job

      await cleanupWorkspaceOldLogsJob(mockJob)

      const remainingSpans = await database
        .select()
        .from(spans)
        .where(eq(spans.workspaceId, workspace1.id))

      expect(remainingSpans.length).toBe(1)
      expect(remainingSpans[0]!.id).toBe(oldSpan.id)
    })
  })

  describe('limited retention plans', () => {
    it('deletes old data for hobby plan (30 day retention)', async () => {
      await factories.createSpan({
        workspaceId: workspace1.id,
        startedAt: THIRTY_ONE_DAYS_AGO,
      })

      freezeTime()

      const mockJob = {
        data: { workspaceId: workspace1.id, batchSize: 2 },
      } as Job<{ workspaceId: number; batchSize: number }>

      await cleanupWorkspaceOldLogsJob(mockJob)

      const remainingSpans = await database
        .select()
        .from(spans)
        .where(eq(spans.workspaceId, workspace1.id))

      expect(remainingSpans.length).toBe(0)
    })

    it('deletes old data for team plan (90 day retention)', async () => {
      const sub = await factories.createSubscription({
        workspaceId: workspace1.id,
        plan: SubscriptionPlan.TeamV4,
      })
      await updateWorkspace(workspace1, { currentSubscriptionId: sub.id })

      await factories.createSpan({
        workspaceId: workspace1.id,
        startedAt: NINETY_ONE_DAYS_AGO,
      })

      const recentSpan = await factories.createSpan({
        workspaceId: workspace1.id,
        startedAt: EIGHTY_NINE_DAYS_AGO,
      })

      freezeTime()

      const mockJob = {
        data: { workspaceId: workspace1.id, batchSize: 1 },
      } as Job<{ workspaceId: number; batchSize: number }>

      await cleanupWorkspaceOldLogsJob(mockJob)

      const remainingSpans = await database
        .select()
        .from(spans)
        .where(eq(spans.workspaceId, workspace1.id))

      expect(remainingSpans.length).toBe(1)
      expect(remainingSpans[0]!.id).toBe(recentSpan.id)
    })

    it('deletes old data for pro plan (30 day retention)', async () => {
      const sub = await factories.createSubscription({
        workspaceId: workspace1.id,
        plan: SubscriptionPlan.ProV2,
      })
      await updateWorkspace(workspace1, { currentSubscriptionId: sub.id })

      await factories.createSpan({
        workspaceId: workspace1.id,
        startedAt: THIRTY_ONE_DAYS_AGO,
      })

      freezeTime()

      const mockJob = {
        data: { workspaceId: workspace1.id, batchSize: 2 },
      } as Job<{ workspaceId: number; batchSize: number }>

      await cleanupWorkspaceOldLogsJob(mockJob)

      const remainingSpans = await database
        .select()
        .from(spans)
        .where(eq(spans.workspaceId, workspace1.id))

      expect(remainingSpans.length).toBe(0)
    })
  })

  it('handles empty workspace with no logs', async () => {
    freezeTime()

    const mockJob = {
      data: { workspaceId: workspace1.id },
    } as Job

    await cleanupWorkspaceOldLogsJob(mockJob)

    const remainingSpans = await database
      .select()
      .from(spans)
      .where(eq(spans.workspaceId, workspace1.id))

    expect(remainingSpans.length).toBe(0)
  })

  it('handles workspace with only recent logs', async () => {
    const recentSpan = await factories.createSpan({
      workspaceId: workspace1.id,
      startedAt: TWENTY_NINE_DAYS_AGO,
    })

    freezeTime()

    const mockJob = {
      data: { workspaceId: workspace1.id },
    } as Job

    await cleanupWorkspaceOldLogsJob(mockJob)

    const remainingSpans = await database
      .select()
      .from(spans)
      .where(eq(spans.workspaceId, workspace1.id))

    expect(remainingSpans.length).toBe(1)
    expect(remainingSpans[0]!.id).toBe(recentSpan.id)
  })

  it('handles spans without associated provider logs', async () => {
    await factories.createSpan({
      workspaceId: workspace1.id,
      documentLogUuid: uuid(),
      startedAt: THIRTY_ONE_DAYS_AGO,
    })

    freezeTime()

    const mockJob = {
      data: { workspaceId: workspace1.id, batchSize: 2 },
    } as Job<{ workspaceId: number; batchSize: number }>

    await cleanupWorkspaceOldLogsJob(mockJob)

    const remainingSpans = await database
      .select()
      .from(spans)
      .where(eq(spans.workspaceId, workspace1.id))

    expect(remainingSpans.length).toBe(0)
  })

  it('correctly calculates cutoff date', async () => {
    await factories.createSpan({
      workspaceId: workspace1.id,
      startedAt: THIRTY_ONE_DAYS_AGO,
    })

    const span2 = await factories.createSpan({
      workspaceId: workspace1.id,
      startedAt: TWENTY_NINE_AND_HALF_DAYS_AGO,
    })

    const span3 = await factories.createSpan({
      workspaceId: workspace1.id,
      startedAt: TWENTY_NINE_DAYS_AGO,
    })

    freezeTime()

    const mockJob = {
      data: { workspaceId: workspace1.id, batchSize: 1 },
    } as Job<{ workspaceId: number; batchSize: number }>

    await cleanupWorkspaceOldLogsJob(mockJob)

    const remainingSpans = await database
      .select()
      .from(spans)
      .where(eq(spans.workspaceId, workspace1.id))

    expect(remainingSpans.length).toBe(2)
    const remainingIds = remainingSpans.map((s) => s.id)
    expect(remainingIds).toContain(span2.id)
    expect(remainingIds).toContain(span3.id)
  })

  it('deletes old spans that share the same traceId', async () => {
    const traceId = 'shared-trace-id-12345678901234'

    await factories.createSpan({
      id: 'span-id-001',
      traceId,
      workspaceId: workspace1.id,
      startedAt: THIRTY_ONE_DAYS_AGO,
    })

    await factories.createSpan({
      id: 'span-id-002',
      traceId,
      workspaceId: workspace1.id,
      parentId: 'span-id-001',
      startedAt: THIRTY_ONE_DAYS_AGO,
    })

    freezeTime()

    const mockJob = {
      data: { workspaceId: workspace1.id, batchSize: 1 },
    } as Job<{ workspaceId: number; batchSize: number }>

    await cleanupWorkspaceOldLogsJob(mockJob)

    const remainingSpans = await database
      .select()
      .from(spans)
      .where(eq(spans.workspaceId, workspace1.id))

    expect(remainingSpans.length).toBe(0)
  })

  it('does not delete spans from other workspaces with same traceId', async () => {
    const traceId = 'shared-trace-id-across-ws'

    await factories.createSpan({
      traceId,
      workspaceId: workspace1.id,
      startedAt: THIRTY_ONE_DAYS_AGO,
    })

    const spanWorkspace2 = await factories.createSpan({
      traceId,
      workspaceId: workspace2.id,
      startedAt: THIRTY_ONE_DAYS_AGO,
    })

    freezeTime()

    const mockJob = {
      data: { workspaceId: workspace1.id, batchSize: 1 },
    } as Job<{ workspaceId: number; batchSize: number }>

    await cleanupWorkspaceOldLogsJob(mockJob)

    const remainingSpansWorkspace1 = await database
      .select()
      .from(spans)
      .where(eq(spans.workspaceId, workspace1.id))

    expect(remainingSpansWorkspace1.length).toBe(0)

    const remainingSpansWorkspace2 = await database
      .select()
      .from(spans)
      .where(eq(spans.workspaceId, workspace2.id))

    expect(remainingSpansWorkspace2.length).toBe(1)
    expect(remainingSpansWorkspace2[0]!.id).toBe(spanWorkspace2.id)
  })

  it('continues batching when trace deletion exceeds batch size', async () => {
    const traceIdA = 'trace-a-with-two-spans'
    const traceIdB = 'trace-b-single-span'

    await factories.createSpan({
      id: 'span-a1',
      traceId: traceIdA,
      workspaceId: workspace1.id,
      startedAt: THIRTY_ONE_DAYS_AGO,
    })

    await factories.createSpan({
      id: 'span-a2',
      traceId: traceIdA,
      workspaceId: workspace1.id,
      parentId: 'span-a1',
      startedAt: THIRTY_ONE_DAYS_AGO,
    })

    await factories.createSpan({
      id: 'span-b1',
      traceId: traceIdB,
      workspaceId: workspace1.id,
      startedAt: THIRTY_ONE_DAYS_AGO,
    })

    freezeTime()

    const mockJob = {
      data: { workspaceId: workspace1.id, batchSize: 1 },
    } as Job<{ workspaceId: number; batchSize: number }>

    await cleanupWorkspaceOldLogsJob(mockJob)

    const remainingSpans = await database
      .select()
      .from(spans)
      .where(eq(spans.workspaceId, workspace1.id))

    expect(remainingSpans.length).toBe(0)
  })
})
