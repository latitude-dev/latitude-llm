import { beforeAll, describe, expect, it } from 'vitest'
import { SpanType } from '../../../constants'
import { createWorkspace } from '../../../tests/factories'
import { createSpan } from '../../../tests/factories/spans'
import { getActiveWorkspacesForWeeklyEmail } from './index'
import { Workspace } from '../../../schema/models/types/Workspace'

let workspace: Workspace

describe('getActiveWorkspacesForWeeklyEmail', () => {
  beforeAll(async () => {
    const { workspace: ws } = await createWorkspace()
    workspace = ws
  })

  describe('when workspace has no activity', () => {
    it('returns empty array when no spans exist', async () => {
      // Common workspace has no spans yet
      const result = await getActiveWorkspacesForWeeklyEmail()
      expect(result).toEqual([])
    })
  })

  describe('when workspace has prompt spans in last 4 weeks', () => {
    it('includes workspace with recent prompt spans', async () => {
      const threeDaysAgo = new Date()
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)

      await createSpan({
        workspaceId: workspace.id,
        type: SpanType.Prompt,
        startedAt: threeDaysAgo,
      })

      const result = await getActiveWorkspacesForWeeklyEmail()

      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: workspace.id,
          }),
        ]),
      )
    })
  })

  describe('when workspace has only old or non-prompt spans', () => {
    it('excludes workspace with only old prompt spans', async () => {
      const { workspace: oldWorkspace } = await createWorkspace()
      const fiveWeeksAgo = new Date()
      fiveWeeksAgo.setDate(fiveWeeksAgo.getDate() - 35)

      await createSpan({
        workspaceId: oldWorkspace.id,
        type: SpanType.Prompt,
        startedAt: fiveWeeksAgo,
      })

      const result = await getActiveWorkspacesForWeeklyEmail()

      expect(result).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: oldWorkspace.id,
          }),
        ]),
      )
    })

    it('excludes workspace with only non-prompt spans', async () => {
      const { workspace: nonPromptWorkspace } = await createWorkspace()
      const threeDaysAgo = new Date()
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)

      // Create completion span (not prompt)
      await createSpan({
        workspaceId: nonPromptWorkspace.id,
        type: SpanType.Completion,
        startedAt: threeDaysAgo,
      })

      // Create step span (not prompt)
      await createSpan({
        workspaceId: nonPromptWorkspace.id,
        type: SpanType.Step,
        startedAt: threeDaysAgo,
      })

      const result = await getActiveWorkspacesForWeeklyEmail()

      expect(result).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: nonPromptWorkspace.id,
          }),
        ]),
      )
    })
  })

  describe('when multiple workspaces exist', () => {
    it('includes multiple active workspaces', async () => {
      const { workspace: workspace2 } = await createWorkspace()
      const { workspace: workspace3 } = await createWorkspace()

      const twoDaysAgo = new Date()
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)

      // Create spans for common workspace and workspace2
      await createSpan({
        workspaceId: workspace.id,
        type: SpanType.Prompt,
        startedAt: twoDaysAgo,
      })

      await createSpan({
        workspaceId: workspace2.id,
        type: SpanType.Prompt,
        startedAt: twoDaysAgo,
      })

      // workspace3 has old activity
      const fiveWeeksAgo = new Date()
      fiveWeeksAgo.setDate(fiveWeeksAgo.getDate() - 35)
      await createSpan({
        workspaceId: workspace3.id,
        type: SpanType.Prompt,
        startedAt: fiveWeeksAgo,
      })

      const result = await getActiveWorkspacesForWeeklyEmail()

      // Should include common workspace and workspace2
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: workspace.id }),
          expect.objectContaining({ id: workspace2.id }),
        ]),
      )

      // Should not include workspace3
      expect(result).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: workspace3.id }),
        ]),
      )
    })

    it('handles workspace with multiple prompt spans (counts once)', async () => {
      const threeDaysAgo = new Date()
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)

      // Create multiple prompt spans for common workspace
      await createSpan({
        workspaceId: workspace.id,
        type: SpanType.Prompt,
        startedAt: threeDaysAgo,
      })

      await createSpan({
        workspaceId: workspace.id,
        type: SpanType.Prompt,
        startedAt: threeDaysAgo,
      })

      await createSpan({
        workspaceId: workspace.id,
        type: SpanType.Prompt,
        startedAt: threeDaysAgo,
      })

      const result = await getActiveWorkspacesForWeeklyEmail()

      // Should include workspace only once
      const workspaceCount = result.filter((w) => w.id === workspace.id).length
      expect(workspaceCount).toEqual(1)
    })
  })

  describe('big account filtering', () => {
    it('excludes workspaces marked as big accounts', async () => {
      const { workspace: regularWorkspace } = await createWorkspace({
        isBigAccount: false,
      })
      const { workspace: bigWorkspace } = await createWorkspace({
        isBigAccount: true,
      })

      const threeDaysAgo = new Date()
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)

      // Both workspaces have recent activity
      await createSpan({
        workspaceId: regularWorkspace.id,
        type: SpanType.Prompt,
        startedAt: threeDaysAgo,
      })

      await createSpan({
        workspaceId: bigWorkspace.id,
        type: SpanType.Prompt,
        startedAt: threeDaysAgo,
      })

      const result = await getActiveWorkspacesForWeeklyEmail()

      // Should include regular workspace
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: regularWorkspace.id }),
        ]),
      )

      // Should NOT include big account workspace
      expect(result).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: bigWorkspace.id }),
        ]),
      )
    })

    it('includes only non-big accounts when multiple workspaces are active', async () => {
      const { workspace: bigWorkspace } = await createWorkspace({
        isBigAccount: true,
      })
      const { workspace: regularWorkspace } = await createWorkspace({
        isBigAccount: false,
      })

      const twoDaysAgo = new Date()
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)

      // All workspaces have activity
      await createSpan({
        workspaceId: workspace.id,
        type: SpanType.Prompt,
        startedAt: twoDaysAgo,
      })

      await createSpan({
        workspaceId: bigWorkspace.id,
        type: SpanType.Prompt,
        startedAt: twoDaysAgo,
      })

      await createSpan({
        workspaceId: regularWorkspace.id,
        type: SpanType.Prompt,
        startedAt: twoDaysAgo,
      })

      const result = await getActiveWorkspacesForWeeklyEmail()

      // Should include common workspace and regularWorkspace (not big accounts)
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: workspace.id }),
          expect.objectContaining({ id: regularWorkspace.id }),
        ]),
      )

      // Should not include bigWorkspace (big account)
      expect(result).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: bigWorkspace.id }),
        ]),
      )
    })
  })

  describe('edge cases', () => {
    it('includes workspace with span at 27 days ago (within 4 weeks)', async () => {
      const { workspace: edgeCaseWorkspace } = await createWorkspace()
      const twentySevenDaysAgo = new Date()
      twentySevenDaysAgo.setDate(twentySevenDaysAgo.getDate() - 27)

      await createSpan({
        workspaceId: edgeCaseWorkspace.id,
        type: SpanType.Prompt,
        startedAt: twentySevenDaysAgo,
      })

      const result = await getActiveWorkspacesForWeeklyEmail()

      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: edgeCaseWorkspace.id,
          }),
        ]),
      )
    })

    it('excludes workspace with span exactly 29 days ago', async () => {
      const { workspace: tooOldWorkspace } = await createWorkspace()
      const twentyNineDaysAgo = new Date()
      twentyNineDaysAgo.setDate(twentyNineDaysAgo.getDate() - 29)

      await createSpan({
        workspaceId: tooOldWorkspace.id,
        type: SpanType.Prompt,
        startedAt: twentyNineDaysAgo,
      })

      const result = await getActiveWorkspacesForWeeklyEmail()

      expect(result).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: tooOldWorkspace.id,
          }),
        ]),
      )
    })

    it('returns full workspace objects with all fields', async () => {
      const threeDaysAgo = new Date()
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)

      await createSpan({
        workspaceId: workspace.id,
        type: SpanType.Prompt,
        startedAt: threeDaysAgo,
      })

      const result = await getActiveWorkspacesForWeeklyEmail()

      const foundWorkspace = result.find((w) => w.id === workspace.id)
      expect(foundWorkspace).toBeDefined()
      expect(foundWorkspace?.name).toBeDefined()
      expect(foundWorkspace?.createdAt).toBeDefined()
    })
  })
})
