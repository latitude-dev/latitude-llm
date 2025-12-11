import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { subDays } from 'date-fns'
import Mail from 'nodemailer/lib/mailer'
import { ESCALATION_EXPIRATION_DAYS } from '@latitude-data/constants/issues'
import { Result } from '../../lib/Result'
import { createIssue, createProject } from '../../tests/factories'
import { IssueIncrementedEvent } from '../events'
import { sendIssueEscalatingHandler } from './sendIssueEscalatingHandler'
import { IssueEscalatingMailer } from '../../mailer/mailers/issues/IssueEscalatingMailer'
import * as datadogCapture from '../../utils/datadogCapture'
import * as checkEscalationModule from '../../services/issues/histograms/checkEscalation'
import type { Workspace } from '../../schema/models/types/Workspace'
import type { Project } from '../../schema/models/types/Project'
import type { DocumentVersion } from '../../schema/models/types/DocumentVersion'
import type { User } from '../../schema/models/types/User'
import type { Commit } from '../../schema/models/types/Commit'

// Mock sendMail to prevent actual email sending
const mockSendMail = vi.fn().mockResolvedValue(
  Result.ok({
    messageId: 'test-message-id',
    accepted: ['test@example.com'],
    rejected: [],
    pending: [],
    envelope: { from: 'test@example.com', to: ['test@example.com'] },
    response: 'OK',
  }),
)

vi.mock('../../mailer/mailers/issues/IssueEscalatingMailer', async () => {
  const actual = await vi.importActual<
    typeof import('../../mailer/mailers/issues/IssueEscalatingMailer')
  >('../../mailer/mailers/issues/IssueEscalatingMailer')
  const OriginalMailer = actual.IssueEscalatingMailer
  return {
    IssueEscalatingMailer: vi
      .fn()
      .mockImplementation(
        (
          options: Mail.Options,
          { issueTitle, link }: { issueTitle: string; link: string },
        ) => {
          const instance = new OriginalMailer(options, { issueTitle, link })
          instance['sendMail'] = mockSendMail
          return instance
        },
      ),
  }
})

vi.mock('../../utils/datadogCapture', () => ({
  captureException: vi.fn(),
}))

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

      // Verify email was sent through the adapter
      expect(mockSendMail).toHaveBeenCalled()

      // Verify email options passed to adapter
      const emailOptions = mockSendMail.mock.calls[0][0]
      expect(emailOptions.to).toBeInstanceOf(Array)
      expect(emailOptions.to.length).toBeGreaterThan(0)
      expect(emailOptions.to).toContain(user.email)
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

      // With 3 users and batch size of 2, should send 2 batches (real sendInBatches handles this)
      expect(mockSendMail).toHaveBeenCalledTimes(2)

      // Verify batches were sent with proper email options
      const firstCall = mockSendMail.mock.calls[0][0]
      const secondCall = mockSendMail.mock.calls[1][0]

      // First batch should have 2 recipients
      expect(firstCall.to).toHaveLength(2)
      // Second batch should have 1 recipient
      expect(secondCall.to).toHaveLength(1)

      // Verify all 3 users were sent emails
      const allRecipients = [...firstCall.to, ...secondCall.to]
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

      // Mock sendMail to return error
      const sendError = new Error('Email provider failed')
      mockSendMail.mockResolvedValueOnce(Result.error(sendError))

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
          mailName: 'issue_escalation_email',
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
      mockSendMail.mockResolvedValueOnce(Result.error(sendError))

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

      // Verify email was sent
      expect(mockSendMail).toHaveBeenCalled()

      // Verify email options passed to adapter
      const emailOptions = mockSendMail.mock.calls[0][0]

      // Verify recipients
      expect(emailOptions.to).toBeInstanceOf(Array)
      expect(emailOptions.to.length).toBeGreaterThan(0)
      expect(emailOptions.to).toContain(user.email)

      // Verify recipient variables are properly formatted
      expect(emailOptions['recipient-variables']).toBeDefined()
      const recipientVars =
        typeof emailOptions['recipient-variables'] === 'string'
          ? JSON.parse(emailOptions['recipient-variables'])
          : emailOptions['recipient-variables']
      expect(recipientVars[user.email]).toBeDefined()
      expect(recipientVars[user.email].name).toBeDefined()
      expect(recipientVars[user.email].userId).toBeDefined()
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

      // Verify emails were sent
      expect(mockSendMail).toHaveBeenCalled()

      // Get all recipients from all batches
      const allRecipients = mockSendMail.mock.calls.flatMap(
        (call) => call[0].to,
      )

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
