import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { subDays } from 'date-fns'
import { ESCALATION_EXPIRATION_DAYS } from '@latitude-data/constants/issues'
import { Result } from '../../lib/Result'
import { createIssue, createProject } from '../../tests/factories'
import { IssueIncrementedEvent } from '../events'
import { sendIssueEscalatingHandler } from './sendIssueEscalatingHandler'
import { IssueEscalatingMailer } from '../../mailers'
import * as datadogCapture from '../../utils/datadogCapture'
import * as checkEscalationModule from '../../services/issues/histograms/checkEscalation'
import type { Workspace } from '../../schema/models/types/Workspace'
import type { Project } from '../../schema/models/types/Project'
import type { DocumentVersion } from '../../schema/models/types/DocumentVersion'
import type { User } from '../../schema/models/types/User'
import type { Commit } from '../../schema/models/types/Commit'

// Mock the mailer
vi.mock('../../mailers', () => ({
  IssueEscalatingMailer: vi.fn().mockImplementation(() => ({
    send: vi
      .fn()
      .mockResolvedValue(Result.ok({ messageId: 'test-message-id' })),
  })),
}))

// Mock datadog capture
vi.mock('../../utils/datadogCapture', () => ({
  captureException: vi.fn(),
}))

// Mock checkEscalation (already tested in isolation)
vi.mock('../../services/issues/histograms/checkEscalation', () => ({
  checkEscalation: vi.fn(),
}))

describe('sendIssueEscalatingHandler', () => {
  let workspace: Workspace
  let project: Project
  let documents: DocumentVersion[]
  let user: User
  let commit: Commit

  beforeAll(async () => {
    const setup = await createProject({
      documents: {
        'test-doc': 'Hello world',
      },
    })
    workspace = setup.workspace
    project = setup.project
    documents = setup.documents
    user = setup.user
    commit = setup.commit
  })

  beforeEach(() => {
    vi.clearAllMocks()

    // Default: not escalating
    vi.mocked(checkEscalationModule.checkEscalation).mockResolvedValue({
      isEscalating: false,
    })
  })

  describe('when issue is not escalating', () => {
    it('should not send email if issue.escalatingAt is null', async () => {
      const doc = documents[0]!

      const { issue } = await createIssue({
        workspace,
        project,
        document: doc,
        createdAt: new Date(),
      })

      // Ensure issue is not escalating
      expect(issue.escalatingAt).toBeNull()

      const event: IssueIncrementedEvent = {
        type: 'issueIncremented',
        data: {
          workspaceId: workspace.id,
          issueId: issue.id,
          histogramId: 1,
          commitUuid: commit.uuid,
          projectId: project.id,
        },
      }

      await sendIssueEscalatingHandler({ data: event })

      expect(IssueEscalatingMailer).not.toHaveBeenCalled()
    })
  })

  describe('when issue just started escalating', () => {
    it('should send email when previousEscalatingAt is null and issue is now escalating', async () => {
      const doc = documents[0]!

      const { issue } = await createIssue({
        workspace,
        project,
        document: doc,
        createdAt: new Date(),
      })

      // Mock checkEscalation to return isEscalating: true
      vi.mocked(checkEscalationModule.checkEscalation).mockResolvedValueOnce({
        isEscalating: true,
      })

      const event: IssueIncrementedEvent = {
        type: 'issueIncremented',
        data: {
          workspaceId: workspace.id,
          issueId: issue.id,
          histogramId: 1,
          commitUuid: commit.uuid,
          projectId: project.id,
        },
      }

      await sendIssueEscalatingHandler({ data: event })

      // Verify mailer was instantiated
      expect(IssueEscalatingMailer).toHaveBeenCalledWith(
        {},
        {
          issueTitle: issue.title,
          link: expect.stringContaining(
            `/projects/${project.id}/versions/${commit.uuid}/issues?issueId=${issue.id}`,
          ),
        },
      )

      // Verify send was called
      const mailerInstance = vi.mocked(IssueEscalatingMailer).mock.results[0]
        ?.value
      expect(mailerInstance.send).toHaveBeenCalled()

      // Verify issue data includes histogram
      const sendCall = mailerInstance.send.mock.calls[0][0]
      expect(sendCall.issue).toBeDefined()
      expect(sendCall.issue.title).toBe(issue.title)
      expect(sendCall.issue.eventsCount).toBeGreaterThanOrEqual(0)
      expect(sendCall.issue.histogram).toBeInstanceOf(Array)
      expect(sendCall.issue.histogram.length).toBeGreaterThan(0)
      expect(sendCall.issue.histogram[0]).toHaveProperty('date')
      expect(sendCall.issue.histogram[0]).toHaveProperty('count')

      // Verify currentWorkspace is passed
      expect(sendCall.currentWorkspace).toBeDefined()
      expect(sendCall.currentWorkspace.id).toBe(workspace.id)
    })

    it('should send emails in batches when there are many users', async () => {
      const doc = documents[0]!

      // Create 2 additional users (total 3 users with the one from createProject)
      const { createUser } = await import('../../tests/factories/users')
      const { createMembership } = await import(
        '../../services/memberships/create'
      )

      const user2 = await createUser({ email: 'user2@example.com' })
      const user3 = await createUser({ email: 'user3@example.com' })

      await createMembership({ workspace, user: user2 }).then((r) => r.unwrap())
      await createMembership({ workspace, user: user3 }).then((r) => r.unwrap())

      const { issue } = await createIssue({
        workspace,
        project,
        document: doc,
        createdAt: new Date(),
      })

      // Mock checkEscalation to return isEscalating: true
      vi.mocked(checkEscalationModule.checkEscalation).mockResolvedValueOnce({
        isEscalating: true,
      })

      // Mock mailer to track batch calls
      const mockSend = vi
        .fn()
        .mockResolvedValue(Result.ok({ messageId: 'test' }))
      vi.mocked(IssueEscalatingMailer).mockImplementation(
        () =>
          ({
            send: mockSend,
          }) as unknown as IssueEscalatingMailer,
      )

      const event: IssueIncrementedEvent = {
        type: 'issueIncremented',
        data: {
          workspaceId: workspace.id,
          issueId: issue.id,
          histogramId: 1,
          commitUuid: commit.uuid,
          projectId: project.id,
        },
      }

      // Pass batchSize: 2 to test batching (3 users = 2 batches: [2, 1])
      await sendIssueEscalatingHandler({ data: event, batchSize: 2 })

      // With 3 users and batch size of 2, should send 2 batches
      expect(mockSend).toHaveBeenCalledTimes(2)

      // Verify first batch has 2 users
      const firstBatch = mockSend.mock.calls[0][0]
      expect(firstBatch.to).toHaveLength(2)
      expect(firstBatch.recipientVariables).toBeDefined()
      expect(Object.keys(firstBatch.recipientVariables)).toHaveLength(2)

      // Verify second batch has 1 user
      const secondBatch = mockSend.mock.calls[1][0]
      expect(secondBatch.to).toHaveLength(1)
      expect(secondBatch.recipientVariables).toBeDefined()
      expect(Object.keys(secondBatch.recipientVariables)).toHaveLength(1)

      // Verify all 3 users were sent emails
      const allRecipients = [...firstBatch.to, ...secondBatch.to]
      expect(allRecipients).toHaveLength(3)
      expect(allRecipients).toEqual(
        expect.arrayContaining([user.email, user2.email, user3.email]),
      )
    })
  })

  describe('when issue was escalating but expired', () => {
    it('should send email when previousEscalatingAt is expired and issue is still escalating', async () => {
      const doc = documents[0]!

      const { issue } = await createIssue({
        workspace,
        project,
        document: doc,
        createdAt: new Date(),
        escalatingAt: subDays(new Date(), ESCALATION_EXPIRATION_DAYS + 1),
      })

      // Mock checkEscalation to return isEscalating: true
      vi.mocked(checkEscalationModule.checkEscalation).mockResolvedValueOnce({
        isEscalating: true,
      })

      // Previous escalation was 8 days ago (expired)

      const event: IssueIncrementedEvent = {
        type: 'issueIncremented',
        data: {
          workspaceId: workspace.id,
          issueId: issue.id,
          histogramId: 1,
          commitUuid: commit.uuid,
          projectId: project.id,
        },
      }

      await sendIssueEscalatingHandler({ data: event })

      // Verify mailer was called (new escalation session)
      expect(IssueEscalatingMailer).toHaveBeenCalled()
    })
  })

  describe('when issue is still in active escalation period', () => {
    it('should NOT send email when previousEscalatingAt is recent (not expired)', async () => {
      const doc = documents[0]!

      // Create issue with escalatingAt set 2 days ago (recent, not expired)
      const { issue } = await createIssue({
        workspace,
        project,
        document: doc,
        createdAt: new Date(),
        escalatingAt: subDays(new Date(), 2),
      })

      // Mock checkEscalation to return isEscalating: true (still escalating)
      vi.mocked(checkEscalationModule.checkEscalation).mockResolvedValueOnce({
        isEscalating: true,
      })

      const event: IssueIncrementedEvent = {
        type: 'issueIncremented',
        data: {
          workspaceId: workspace.id,
          issueId: issue.id,
          histogramId: 1,
          commitUuid: commit.uuid,
          projectId: project.id,
        },
      }

      await sendIssueEscalatingHandler({ data: event })

      // Verify mailer was NOT called (still in same escalation period)
      expect(IssueEscalatingMailer).not.toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    it('should capture error when email sending fails', async () => {
      const doc = documents[0]!

      const { issue } = await createIssue({
        workspace,
        project,
        document: doc,
        createdAt: new Date(),
      })

      // Mock checkEscalation to return isEscalating: true
      vi.mocked(checkEscalationModule.checkEscalation).mockResolvedValueOnce({
        isEscalating: true,
      })

      // Mock mailer to return error
      const sendError = new Error('Email provider failed')
      vi.mocked(IssueEscalatingMailer).mockImplementationOnce(
        () =>
          ({
            send: vi.fn().mockResolvedValue(Result.error(sendError)),
          }) as unknown as IssueEscalatingMailer,
      )

      const event: IssueIncrementedEvent = {
        type: 'issueIncremented',
        data: {
          workspaceId: workspace.id,
          issueId: issue.id,
          histogramId: 1,
          commitUuid: commit.uuid,
          projectId: project.id,
        },
      }

      await sendIssueEscalatingHandler({ data: event })

      // Verify error was captured
      expect(datadogCapture.captureException).toHaveBeenCalledWith(
        sendError,
        expect.objectContaining({
          issueId: issue.id,
          issueTitle: issue.title,
          workspaceId: workspace.id,
          context: 'issue_escalation_email',
        }),
      )
    })

    it('should capture batch index when specific batch fails', async () => {
      const doc = documents[0]!

      const { issue } = await createIssue({
        workspace,
        project,
        document: doc,
        createdAt: new Date(),
      })

      // Mock checkEscalation to return isEscalating: true
      vi.mocked(checkEscalationModule.checkEscalation).mockResolvedValueOnce({
        isEscalating: true,
      })

      const sendError = new Error('Batch 0 failed')
      vi.mocked(IssueEscalatingMailer).mockImplementationOnce(
        () =>
          ({
            send: vi.fn().mockResolvedValue(Result.error(sendError)),
          }) as unknown as IssueEscalatingMailer,
      )

      const event: IssueIncrementedEvent = {
        type: 'issueIncremented',
        data: {
          workspaceId: workspace.id,
          issueId: issue.id,
          histogramId: 1,
          commitUuid: commit.uuid,
          projectId: project.id,
        },
      }

      await sendIssueEscalatingHandler({ data: event })

      // Verify batch index was captured
      expect(datadogCapture.captureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          batchIndex: expect.any(Number),
          batchSize: expect.any(Number),
        }),
      )
    })
  })

  describe('email formatting', () => {
    it('should format recipients and include histogram data', async () => {
      const doc = documents[0]!

      const { issue } = await createIssue({
        workspace,
        project,
        document: doc,
        createdAt: new Date(),
      })

      // Mock checkEscalation to return isEscalating: true
      vi.mocked(checkEscalationModule.checkEscalation).mockResolvedValueOnce({
        isEscalating: true,
      })

      const event: IssueIncrementedEvent = {
        type: 'issueIncremented',
        data: {
          workspaceId: workspace.id,
          issueId: issue.id,
          histogramId: 1,
          commitUuid: commit.uuid,
          projectId: project.id,
        },
      }

      await sendIssueEscalatingHandler({ data: event })

      // Verify mailer was instantiated
      expect(IssueEscalatingMailer).toHaveBeenCalled()

      const mailerInstance = vi.mocked(IssueEscalatingMailer).mock.results[0]
        ?.value

      // Verify send was called with proper format
      const sendCall = mailerInstance?.send.mock.calls[0][0]

      // Verify recipients
      expect(sendCall.to).toBeInstanceOf(Array)
      expect(sendCall.to.length).toBeGreaterThan(0)

      // Verify recipient variables
      expect(sendCall.recipientVariables).toBeDefined()
      expect(sendCall.recipientVariables[user.email]).toBeDefined()
      expect(sendCall.recipientVariables[user.email].name).toBeDefined()
      expect(sendCall.recipientVariables[user.email].id).toBeDefined()

      // Verify workspace
      expect(sendCall.currentWorkspace).toBeDefined()
      expect(sendCall.currentWorkspace.id).toBe(workspace.id)

      // Verify issue data
      expect(sendCall.issue).toBeDefined()
      expect(sendCall.issue.title).toBe(issue.title)
      expect(sendCall.issue.eventsCount).toBeGreaterThanOrEqual(0)
      expect(sendCall.issue.histogram).toBeInstanceOf(Array)
    })
  })

  describe('notification preferences', () => {
    it('should NOT send email to users who opted out of escalating issue notifications', async () => {
      const doc = documents[0]!

      // Create 2 additional users
      const { createUser } = await import('../../tests/factories/users')
      const { createMembership } = await import(
        '../../services/memberships/create'
      )

      const user2 = await createUser({ email: 'user2@example.com' })
      const user3 = await createUser({ email: 'user3@example.com' })

      // user2 opts in (wants to receive emails)
      await createMembership({
        workspace,
        user: user2,
        wantToReceiveEscalatingIssuesEmail: true,
      }).then((r) => r.unwrap())

      // user3 opts out (does NOT want to receive emails)
      await createMembership({
        workspace,
        user: user3,
        wantToReceiveEscalatingIssuesEmail: false,
      }).then((r) => r.unwrap())

      const { issue } = await createIssue({
        workspace,
        project,
        document: doc,
        createdAt: new Date(),
      })

      // Mock checkEscalation to return isEscalating: true
      vi.mocked(checkEscalationModule.checkEscalation).mockResolvedValueOnce({
        isEscalating: true,
      })

      // Mock mailer to track recipients
      const mockSend = vi
        .fn()
        .mockResolvedValue(Result.ok({ messageId: 'test' }))
      vi.mocked(IssueEscalatingMailer).mockImplementation(
        () =>
          ({
            send: mockSend,
          }) as unknown as IssueEscalatingMailer,
      )

      const event: IssueIncrementedEvent = {
        type: 'issueIncremented',
        data: {
          workspaceId: workspace.id,
          issueId: issue.id,
          histogramId: 1,
          commitUuid: commit.uuid,
          projectId: project.id,
        },
      }

      await sendIssueEscalatingHandler({ data: event })

      // Verify mailer was called
      expect(mockSend).toHaveBeenCalled()

      // Get all recipients from all batches
      const allRecipients = mockSend.mock.calls.flatMap((call) => call[0].to)

      // Should only include user (default opted-in) and user2 (explicitly opted-in)
      // Should NOT include user3 (opted-out)
      expect(allRecipients).toHaveLength(2)
      expect(allRecipients).toContain(user.email)
      expect(allRecipients).toContain(user2.email)
      expect(allRecipients).not.toContain(user3.email)
    })

    it('should NOT send any emails if all users opted out', async () => {
      const doc = documents[0]!

      // Update the default user's membership to opt out
      const { MembershipsRepository } = await import('../../repositories')
      const { updateEscalatingIssuesEmailPreference } = await import(
        '../../services/memberships/updateEscalatingIssuesEmailPreference'
      )

      const membershipsRepo = new MembershipsRepository(workspace.id)
      const membership = await membershipsRepo
        .findByUserId(user.id)
        .then((r) => r.unwrap())

      await updateEscalatingIssuesEmailPreference({
        membership,
        wantToReceive: false,
        userEmail: user.email,
      }).then((r) => r.unwrap())

      const { issue } = await createIssue({
        workspace,
        project,
        document: doc,
        createdAt: new Date(),
      })

      // Mock checkEscalation to return isEscalating: true
      vi.mocked(checkEscalationModule.checkEscalation).mockResolvedValueOnce({
        isEscalating: true,
      })

      const event: IssueIncrementedEvent = {
        type: 'issueIncremented',
        data: {
          workspaceId: workspace.id,
          issueId: issue.id,
          histogramId: 1,
          commitUuid: commit.uuid,
          projectId: project.id,
        },
      }

      await sendIssueEscalatingHandler({ data: event })

      // Verify mailer was NOT instantiated (no recipients)
      expect(IssueEscalatingMailer).not.toHaveBeenCalled()
    })
  })
})
