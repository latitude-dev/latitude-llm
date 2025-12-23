import { eq } from 'drizzle-orm'
import { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createWorkspace, createUser } from '../../../tests/factories'
import { createMembership } from '../../../tests/factories/memberships'
import { NotFoundError } from '../../../lib/errors'
import * as logsModule from '../../../data-access/weeklyEmail/logs'
import * as issuesModule from '../../../data-access/weeklyEmail/issues'
import * as annotationsModule from '../../../data-access/weeklyEmail/annotations'
import * as WeeklyEmailMailerModule from '../../../mailer/mailers/weeklyEmail/WeeklyEmailMailer'
import * as publisherModule from '../../../events/publisher'
import { database } from '../../../client'
import { memberships } from '../../../schema/models/memberships'
import { sendWeeklyEmailJob } from './sendWeeklyEmailJob'
import { AddressItem } from '../../../mailer/buildBatchRecipients'

vi.mock('../../../events/publisher', () => ({
  publisher: {
    publishLater: vi.fn(),
  },
}))

// FIXME(andres): this test is flaky!

describe('sendWeeklyEmailJob', () => {
  let mockGetLogsData: ReturnType<typeof vi.fn>
  let mockGetIssuesData: ReturnType<typeof vi.fn>
  let mockGetAnnotationsData: ReturnType<typeof vi.fn>
  let mockSendInBatches: ReturnType<typeof vi.fn>
  let mockSend: ReturnType<typeof vi.fn>

  const mockLogsData = {
    usedInProduction: true,
    logsCount: 100,
    tokensSpent: 5000,
    tokensCost: 10.5,
    topProjects: [],
  }

  const mockIssuesData = {
    hasIssues: true,
    issuesCount: 5,
    newIssuesCount: 2,
    escalatedIssuesCount: 1,
    resolvedIssuesCount: 3,
    ignoredIssuesCount: 0,
    regressedIssuesCount: 0,
    topProjects: [],
    newIssuesList: [],
  }

  const mockAnnotationsData = {
    hasAnnotations: true,
    annotationsCount: 50,
    passedCount: 45,
    failedCount: 5,
    passedPercentage: 90,
    failedPercentage: 10,
    topProjects: [],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetLogsData = vi.fn().mockResolvedValue(mockLogsData)
    mockGetIssuesData = vi.fn().mockResolvedValue(mockIssuesData)
    mockGetAnnotationsData = vi.fn().mockResolvedValue(mockAnnotationsData)
    mockSend = vi.fn().mockResolvedValue({ ok: true, value: {} })
    mockSendInBatches = vi.fn().mockResolvedValue(undefined)

    vi.spyOn(logsModule, 'getLogsData').mockImplementation(mockGetLogsData)
    vi.spyOn(issuesModule, 'getIssuesData').mockImplementation(
      mockGetIssuesData,
    )
    vi.spyOn(annotationsModule, 'getAnnotationsData').mockImplementation(
      mockGetAnnotationsData,
    )

    vi.spyOn(
      WeeklyEmailMailerModule.WeeklyEmailMailer.prototype,
      'sendInBatches',
    ).mockImplementation(mockSendInBatches)
    vi.spyOn(
      WeeklyEmailMailerModule.WeeklyEmailMailer.prototype,
      'send',
    ).mockImplementation(mockSend)
  })

  describe('workspace validation', () => {
    it('throws NotFoundError when workspace does not exist', async () => {
      const job = {
        data: { workspaceId: 99999 },
      } as Job

      await expect(sendWeeklyEmailJob(job)).rejects.toThrow(NotFoundError)
      await expect(sendWeeklyEmailJob(job)).rejects.toThrow(
        'Workspace not found sending weekly email',
      )
    })

    it('processes job successfully when workspace exists', async () => {
      const { workspace } = await createWorkspace()
      await database
        .update(memberships)
        .set({ wantToReceiveWeeklyEmail: true })
        .where(eq(memberships.workspaceId, workspace.id))

      const job = {
        data: { workspaceId: workspace.id },
      } as Job

      await sendWeeklyEmailJob(job)

      expect(mockGetLogsData).toHaveBeenCalledWith({ workspace })
      expect(mockGetIssuesData).toHaveBeenCalledWith({ workspace })
      expect(mockGetAnnotationsData).toHaveBeenCalledWith({ workspace })
    })
  })

  describe('membership filtering', () => {
    it('only sends emails to members who want to receive weekly emails', async () => {
      const { workspace } = await createWorkspace()
      const user1 = await createUser()
      const user2 = await createUser()
      const user3 = await createUser()
      const creator = await createUser()

      await createMembership({ user: user1, workspace, author: creator })
      await createMembership({ user: user2, workspace, author: creator })
      await createMembership({ user: user3, workspace, author: creator })

      // Set wantToReceiveWeeklyEmail for user1 and user2 only
      await database
        .update(memberships)
        .set({ wantToReceiveWeeklyEmail: false })
        .where(eq(memberships.workspaceId, workspace.id))

      await database
        .update(memberships)
        .set({ wantToReceiveWeeklyEmail: true })
        .where(eq(memberships.userId, user1.id))

      await database
        .update(memberships)
        .set({ wantToReceiveWeeklyEmail: true })
        .where(eq(memberships.userId, user2.id))

      const job = {
        data: { workspaceId: workspace.id },
      } as Job

      await sendWeeklyEmailJob(job)

      expect(mockSendInBatches).toHaveBeenCalledTimes(1)
      const callArgs = mockSendInBatches.mock.calls[0][0]
      expect(callArgs.addressList).toHaveLength(2)
      const emails = callArgs.addressList.map((m: AddressItem) => m.email)
      expect(emails).toContain(user1.email)
      expect(emails).toContain(user2.email)
      expect(emails).not.toContain(user3.email)
    })

    it('does not send emails when no members want to receive them', async () => {
      const { workspace } = await createWorkspace()

      // Ensure creator doesn't want emails
      await database
        .update(memberships)
        .set({ wantToReceiveWeeklyEmail: false })
        .where(eq(memberships.workspaceId, workspace.id))

      const job = {
        data: { workspaceId: workspace.id },
      } as Job

      await sendWeeklyEmailJob(job)

      expect(mockSendInBatches).not.toHaveBeenCalled()
      expect(mockGetLogsData).not.toHaveBeenCalled()
      expect(mockGetIssuesData).not.toHaveBeenCalled()
      expect(mockGetAnnotationsData).not.toHaveBeenCalled()
    })

    it('sends emails to all members when all want to receive them', async () => {
      const { workspace, userData: creator } = await createWorkspace()
      const user1 = await createUser()
      const user2 = await createUser()

      await createMembership({ user: user1, workspace, author: creator })
      await createMembership({ user: user2, workspace, author: creator })

      // Set all to want emails
      await database
        .update(memberships)
        .set({ wantToReceiveWeeklyEmail: true })
        .where(eq(memberships.workspaceId, workspace.id))

      const job = {
        data: { workspaceId: workspace.id },
      } as Job

      await sendWeeklyEmailJob(job)

      expect(mockSendInBatches).toHaveBeenCalledTimes(1)
      const callArgs = mockSendInBatches.mock.calls[0][0]
      expect(callArgs.addressList).toHaveLength(3) // creator + 2 users
    })
  })

  describe('data fetching', () => {
    it('fetches logs, issues, and annotations data in parallel', async () => {
      const { workspace } = await createWorkspace()
      await database
        .update(memberships)
        .set({ wantToReceiveWeeklyEmail: true })
        .where(eq(memberships.workspaceId, workspace.id))

      const job = {
        data: { workspaceId: workspace.id },
      } as Job

      await sendWeeklyEmailJob(job)

      expect(mockGetLogsData).toHaveBeenCalledWith({ workspace })
      expect(mockGetIssuesData).toHaveBeenCalledWith({ workspace })
      expect(mockGetAnnotationsData).toHaveBeenCalledWith({ workspace })
    })

    it('passes fetched data to mailer', async () => {
      const { workspace } = await createWorkspace()
      await database
        .update(memberships)
        .set({ wantToReceiveWeeklyEmail: true })
        .where(eq(memberships.workspaceId, workspace.id))

      const job = {
        data: { workspaceId: workspace.id },
      } as Job

      await sendWeeklyEmailJob(job)

      expect(mockSendInBatches).toHaveBeenCalledTimes(1)
      const callArgs = mockSendInBatches.mock.calls[0][0]

      expect(callArgs.context).toEqual({
        mailName: 'weekly_email',
        workspaceId: workspace.id,
        workspaceName: workspace.name,
      })
    })
  })

  describe('mailer integration', () => {
    it('calls sendInBatches with correct parameters', async () => {
      const { workspace } = await createWorkspace()
      await database
        .update(memberships)
        .set({ wantToReceiveWeeklyEmail: true })
        .where(eq(memberships.workspaceId, workspace.id))

      const job = {
        data: { workspaceId: workspace.id },
      } as Job

      await sendWeeklyEmailJob(job)

      expect(mockSendInBatches).toHaveBeenCalledTimes(1)
      const callArgs = mockSendInBatches.mock.calls[0][0]

      expect(callArgs.addressList).toBeDefined()
      expect(callArgs.sendOptions).toBeInstanceOf(Function)
      expect(callArgs.context).toEqual({
        mailName: 'weekly_email',
        workspaceId: workspace.id,
        workspaceName: workspace.name,
      })
      expect(callArgs.batchSize).toBe(100)
    })

    it('passes correct batch size', async () => {
      const { workspace } = await createWorkspace()
      await database
        .update(memberships)
        .set({ wantToReceiveWeeklyEmail: true })
        .where(eq(memberships.workspaceId, workspace.id))

      const job = {
        data: { workspaceId: workspace.id },
      } as Job

      await sendWeeklyEmailJob(job)

      const callArgs = mockSendInBatches.mock.calls[0][0]
      expect(callArgs.batchSize).toBe(100)
    })
  })

  describe('member data structure', () => {
    it('includes email, name, userId, and membershipId for each member', async () => {
      const { workspace, userData: creator } = await createWorkspace()
      const user1 = await createUser()

      await createMembership({ user: user1, workspace, author: creator })

      await database
        .update(memberships)
        .set({ wantToReceiveWeeklyEmail: true })
        .where(eq(memberships.workspaceId, workspace.id))

      const job = {
        data: { workspaceId: workspace.id },
      } as Job

      await sendWeeklyEmailJob(job)

      const callArgs = mockSendInBatches.mock.calls[0][0]
      const member = callArgs.addressList[0]

      expect(member).toHaveProperty('email')
      expect(member).toHaveProperty('name')
      expect(member).toHaveProperty('userId')
      expect(member).toHaveProperty('membershipId')
    })
  })

  describe('weeklyWorkspaceNotified event', () => {
    it('publishes event with correct data after sending emails', async () => {
      const { workspace, userData: creator } = await createWorkspace()

      await database
        .update(memberships)
        .set({ wantToReceiveWeeklyEmail: true })
        .where(eq(memberships.workspaceId, workspace.id))

      const job = {
        data: { workspaceId: workspace.id },
      } as Job

      await sendWeeklyEmailJob(job)

      expect(publisherModule.publisher.publishLater).toHaveBeenCalledWith({
        type: 'weeklyWorkspaceNotified',
        data: {
          userEmail: creator.email,
          workspaceId: workspace.id,
          numberOfEmails: 1,
          logs: {
            logsCount: mockLogsData.logsCount,
            tokensSpent: mockLogsData.tokensSpent,
            tokensCost: mockLogsData.tokensCost,
            usedInProduction: mockLogsData.usedInProduction,
          },
          issues: {
            hasIssues: mockIssuesData.hasIssues,
            issuesCount: mockIssuesData.issuesCount,
            newIssuesCount: mockIssuesData.newIssuesCount,
            escalatedIssuesCount: mockIssuesData.escalatedIssuesCount,
            resolvedIssuesCount: mockIssuesData.resolvedIssuesCount,
            ignoredIssuesCount: mockIssuesData.ignoredIssuesCount,
            regressedIssuesCount: mockIssuesData.regressedIssuesCount,
          },
          annotations: {
            hasAnnotations: mockAnnotationsData.hasAnnotations,
            annotationsCount: mockAnnotationsData.annotationsCount,
            passedCount: mockAnnotationsData.passedCount,
            failedCount: mockAnnotationsData.failedCount,
          },
        },
      })
    })

    it('uses first member email (ordered by createdAt)', async () => {
      const olderUser = await createUser({
        createdAt: new Date('2020-01-01'),
      })
      const newerUser = await createUser({
        createdAt: new Date('2024-01-01'),
      })

      const { workspace } = await createWorkspace({ creator: newerUser })

      await createMembership({ user: olderUser, workspace, author: newerUser })

      await database
        .update(memberships)
        .set({ wantToReceiveWeeklyEmail: true })
        .where(eq(memberships.workspaceId, workspace.id))

      const job = {
        data: { workspaceId: workspace.id },
      } as Job

      await sendWeeklyEmailJob(job)

      expect(publisherModule.publisher.publishLater).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'weeklyWorkspaceNotified',
          data: expect.objectContaining({
            userEmail: olderUser.email,
            numberOfEmails: 2,
          }),
        }),
      )
    })

    it('includes correct member count in numberOfEmails', async () => {
      const { workspace, userData: creator } = await createWorkspace()
      const user1 = await createUser()
      const user2 = await createUser()

      await createMembership({ user: user1, workspace, author: creator })
      await createMembership({ user: user2, workspace, author: creator })

      await database
        .update(memberships)
        .set({ wantToReceiveWeeklyEmail: true })
        .where(eq(memberships.workspaceId, workspace.id))

      const job = {
        data: { workspaceId: workspace.id },
      } as Job

      await sendWeeklyEmailJob(job)

      expect(publisherModule.publisher.publishLater).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            numberOfEmails: 3,
          }),
        }),
      )
    })

    it('does not publish event when no members want to receive emails', async () => {
      const { workspace } = await createWorkspace()

      await database
        .update(memberships)
        .set({ wantToReceiveWeeklyEmail: false })
        .where(eq(memberships.workspaceId, workspace.id))

      const job = {
        data: { workspaceId: workspace.id },
      } as Job

      await sendWeeklyEmailJob(job)

      expect(publisherModule.publisher.publishLater).not.toHaveBeenCalled()
    })

    it('includes stats from fetched data', async () => {
      const customLogsData = {
        usedInProduction: false,
        logsCount: 50,
        tokensSpent: 1000,
        tokensCost: 5.25,
        topProjects: [],
      }

      const customIssuesData = {
        hasIssues: false,
        issuesCount: 0,
        newIssuesCount: 0,
        escalatedIssuesCount: 0,
        resolvedIssuesCount: 0,
        ignoredIssuesCount: 0,
        regressedIssuesCount: 0,
        topProjects: [],
        newIssuesList: [],
      }

      const customAnnotationsData = {
        hasAnnotations: false,
        annotationsCount: 0,
        passedCount: 0,
        failedCount: 0,
        passedPercentage: 0,
        failedPercentage: 0,
        topProjects: [],
      }

      mockGetLogsData.mockResolvedValue(customLogsData)
      mockGetIssuesData.mockResolvedValue(customIssuesData)
      mockGetAnnotationsData.mockResolvedValue(customAnnotationsData)

      const { workspace } = await createWorkspace()

      await database
        .update(memberships)
        .set({ wantToReceiveWeeklyEmail: true })
        .where(eq(memberships.workspaceId, workspace.id))

      const job = {
        data: { workspaceId: workspace.id },
      } as Job

      await sendWeeklyEmailJob(job)

      expect(publisherModule.publisher.publishLater).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            logs: {
              logsCount: 50,
              tokensSpent: 1000,
              tokensCost: 5.25,
              usedInProduction: false,
            },
            issues: {
              hasIssues: false,
              issuesCount: 0,
              newIssuesCount: 0,
              escalatedIssuesCount: 0,
              resolvedIssuesCount: 0,
              ignoredIssuesCount: 0,
              regressedIssuesCount: 0,
            },
            annotations: {
              hasAnnotations: false,
              annotationsCount: 0,
              passedCount: 0,
              failedCount: 0,
            },
          }),
        }),
      )
    })
  })
})
