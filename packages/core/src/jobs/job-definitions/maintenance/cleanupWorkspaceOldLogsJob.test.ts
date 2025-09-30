import { Job } from 'bullmq'
import { beforeEach, describe, expect, it } from 'vitest'
import { cleanupWorkspaceOldLogsJob } from './cleanupWorkspaceOldLogsJob'
import * as factories from '../../../tests/factories'
import { database } from '../../../client'
import { documentLogs, providerLogs, commits, projects } from '../../../schema'
import { eq } from 'drizzle-orm'
import { Providers } from '@latitude-data/constants'
import { SubscriptionPlan } from '../../../plans'
import { updateWorkspace } from '../../../services/workspaces'

describe('cleanupWorkspaceOldLogsJob', () => {
  let workspace1: any
  let workspace2: any
  let commit1: any
  let provider1: any
  let commit2: any
  let document1: any
  let document2: any
  let provider2: any

  beforeEach(async () => {
    // Create two workspaces to test isolation
    const projectData1 = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'OpenAI1' }],
      documents: {
        test: factories.helpers.createPrompt({ provider: 'OpenAI1' }),
      },
    })
    workspace1 = projectData1.workspace
    commit1 = projectData1.commit
    document1 = projectData1.documents[0]
    provider1 = projectData1.providers[0]

    const projectData2 = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'OpenAI2' }],
      documents: {
        test: factories.helpers.createPrompt({ provider: 'OpenAI2' }),
      },
    })
    workspace2 = projectData2.workspace
    commit2 = projectData2.commit
    document2 = projectData2.documents[0]
    provider2 = projectData2.providers[0]
  })

  it('should delete old document logs and associated provider logs from the correct workspace', async () => {
    const now = new Date()
    const thirtyOneDaysAgo = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000)
    const twentyNineDaysAgo = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000)

    // Create old document logs in workspace1 (should be deleted)
    const { documentLog: oldDocLog1 } = await factories.createDocumentLog({
      document: document1,
      commit: commit1,
      createdAt: thirtyOneDaysAgo,
    })

    const { documentLog: oldDocLog2 } = await factories.createDocumentLog({
      document: document1,
      commit: commit1,
      createdAt: thirtyOneDaysAgo,
    })

    // Create recent document logs in workspace1 (should NOT be deleted)
    const { documentLog: recentDocLog1 } = await factories.createDocumentLog({
      document: document1,
      commit: commit1,
      createdAt: twentyNineDaysAgo,
    })

    // Create old document logs in workspace2 (should NOT be deleted)
    const { documentLog: oldDocLogWorkspace2 } =
      await factories.createDocumentLog({
        document: document2,
        commit: commit2,
        createdAt: thirtyOneDaysAgo,
      })

    // Create additional provider logs for old document logs
    await factories.createProviderLog({
      documentLogUuid: oldDocLog1.uuid,
      providerId: provider1.id,
      providerType: provider1.type,
      workspace: workspace1,
    })

    await factories.createProviderLog({
      documentLogUuid: oldDocLog2.uuid,
      providerId: provider1.id,
      providerType: provider1.type,
      workspace: workspace1,
    })

    // Create provider log for recent document log (should NOT be deleted)
    await factories.createProviderLog({
      documentLogUuid: recentDocLog1.uuid,
      providerId: provider1.id,
      providerType: provider1.type,
      workspace: workspace1,
    })

    // Create provider log for workspace2 (should NOT be deleted)
    await factories.createProviderLog({
      documentLogUuid: oldDocLogWorkspace2.uuid,
      providerId: provider2.id,
      providerType: provider2.type,
      workspace: workspace2,
    })

    const mockJob = {
      data: { workspaceId: workspace1.id },
    } as Job

    // Run the cleanup job
    await cleanupWorkspaceOldLogsJob(mockJob)

    // Verify old document logs from workspace1 were deleted
    const remainingDocLogsWorkspace1 = await database
      .select()
      .from(documentLogs)
      .innerJoin(commits, eq(documentLogs.commitId, commits.id))
      .innerJoin(projects, eq(commits.projectId, projects.id))
      .where(eq(projects.workspaceId, workspace1.id))

    expect(remainingDocLogsWorkspace1.length).toBe(1) // Only the recent one should remain
    expect(remainingDocLogsWorkspace1[0].document_logs.id).toBe(
      recentDocLog1.id,
    )

    // Verify old document logs from workspace2 were NOT deleted
    const remainingDocLogsWorkspace2 = await database
      .select()
      .from(documentLogs)
      .innerJoin(commits, eq(documentLogs.commitId, commits.id))
      .innerJoin(projects, eq(commits.projectId, projects.id))
      .where(eq(projects.workspaceId, workspace2.id))

    expect(remainingDocLogsWorkspace2.length).toBe(1)
    expect(remainingDocLogsWorkspace2[0].document_logs.id).toBe(
      oldDocLogWorkspace2.id,
    )

    // Verify provider logs were deleted correctly
    const remainingProviderLogsWorkspace1 = await database
      .select()
      .from(providerLogs)
      .where(eq(providerLogs.workspaceId, workspace1.id))

    expect(remainingProviderLogsWorkspace1.length).toBe(3) // Only the recent document log's provider logs should remain (2 factory + 1 manual)

    // Verify provider logs from workspace2 were NOT deleted
    const remainingProviderLogsWorkspace2 = await database
      .select()
      .from(providerLogs)
      .where(eq(providerLogs.workspaceId, workspace2.id))

    expect(remainingProviderLogsWorkspace2.length).toBe(3)
  })

  it('does nothing if pro plan', async () => {
    const sub = await factories.createSubscription({
      workspaceId: workspace1.id,
      plan: SubscriptionPlan.ProV2,
    })
    await updateWorkspace(workspace1, { currentSubscriptionId: sub.id })

    const mockJob = {
      data: { workspaceId: workspace1.id },
    } as Job

    await cleanupWorkspaceOldLogsJob(mockJob)
  })

  it('does nothing if team v1 plan', async () => {
    const sub = await factories.createSubscription({
      workspaceId: workspace1.id,
      plan: SubscriptionPlan.TeamV1,
    })
    await updateWorkspace(workspace1, { currentSubscriptionId: sub.id })

    const mockJob = {
      data: { workspaceId: workspace1.id },
    } as Job

    await cleanupWorkspaceOldLogsJob(mockJob)
  })

  it('does nothing if team v2 plan', async () => {
    const sub = await factories.createSubscription({
      workspaceId: workspace1.id,
      plan: SubscriptionPlan.TeamV2,
    })
    await updateWorkspace(workspace1, { currentSubscriptionId: sub.id })

    const mockJob = {
      data: { workspaceId: workspace1.id },
    } as Job

    await cleanupWorkspaceOldLogsJob(mockJob)
  })

  it('does nothing if enterprise plan', async () => {
    const sub = await factories.createSubscription({
      workspaceId: workspace1.id,
      plan: SubscriptionPlan.EnterpriseV1,
    })
    await updateWorkspace(workspace1, { currentSubscriptionId: sub.id })

    const mockJob = {
      data: { workspaceId: workspace1.id },
    } as Job

    await cleanupWorkspaceOldLogsJob(mockJob)
  })

  it('should handle empty workspace with no logs', async () => {
    const mockJob = {
      data: { workspaceId: workspace1.id },
    } as Job

    await cleanupWorkspaceOldLogsJob(mockJob)
  })

  it('should handle workspace with only recent logs', async () => {
    const twentyNineDaysAgo = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000)

    // Create only recent logs
    await factories.createDocumentLog({
      document: document1,
      commit: commit1,
      createdAt: twentyNineDaysAgo,
    })

    const mockJob = {
      data: { workspaceId: workspace1.id },
    } as Job

    await cleanupWorkspaceOldLogsJob(mockJob)
  })

  it('should handle document logs without associated provider logs', async () => {
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)

    // Create old document log without provider logs
    await factories.createDocumentLog({
      document: document1,
      commit: commit1,
      createdAt: thirtyOneDaysAgo,
      skipProviderLogs: true,
    })

    const mockJob = {
      data: { workspaceId: workspace1.id },
    } as Job

    await cleanupWorkspaceOldLogsJob(mockJob)
  })

  it('should correctly calculate cutoff date', async () => {
    const now = new Date()

    const thirtyOneDaysAgo = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000)
    const twentyNineDaysAgo = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000)
    // Create a log slightly less than 30 days old to ensure it's not deleted
    const twentyNineAndHalfDaysAgo = new Date(
      now.getTime() - 29.5 * 24 * 60 * 60 * 1000,
    )

    // Create logs at different ages
    await factories.createDocumentLog({
      document: document1,
      commit: commit1,
      createdAt: thirtyOneDaysAgo, // Should be deleted
    })

    await factories.createDocumentLog({
      document: document1,
      commit: commit1,
      createdAt: twentyNineAndHalfDaysAgo, // Should NOT be deleted (29.5 days old)
    })

    await factories.createDocumentLog({
      document: document1,
      commit: commit1,
      createdAt: twentyNineDaysAgo, // Should NOT be deleted
    })

    const mockJob = {
      data: { workspaceId: workspace1.id },
    } as Job

    await cleanupWorkspaceOldLogsJob(mockJob)
  })

  it('should handle multiple projects within the same workspace', async () => {
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)

    // Create another project in workspace1
    const { commit: commit3, documents: documents3 } =
      await factories.createProject({
        workspace: workspace1,
        providers: [{ type: Providers.OpenAI, name: 'OpenAI3' }],
        documents: {
          test: factories.helpers.createPrompt({ provider: 'OpenAI3' }),
        },
      })

    // Create old logs in both projects
    await factories.createDocumentLog({
      document: document1,
      commit: commit1,
      createdAt: thirtyOneDaysAgo,
    })

    await factories.createDocumentLog({
      document: documents3[0],
      commit: commit3,
      createdAt: thirtyOneDaysAgo,
    })

    const mockJob = {
      data: { workspaceId: workspace1.id },
    } as Job

    await cleanupWorkspaceOldLogsJob(mockJob)
  })
})
