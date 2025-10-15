import { beforeEach, describe, expect, it } from 'vitest'
import { OnboardingStepKey } from '@latitude-data/constants/onboardingSteps'
import {
  DocumentTriggerStatus,
  IntegrationType,
} from '@latitude-data/constants'
import { checkNextStepNecessary } from './checkNextStepNecessary'
import * as factories from '../../../../src/tests/factories'
import { type Workspace } from '../../../schema/models/types/Workspace'

describe('checkNextStepNecessary', () => {
  let workspace: Workspace

  beforeEach(async () => {
    const { workspace: createdWorkspace } = await factories.createWorkspace()
    workspace = createdWorkspace
  })

  describe('SetupIntegrations step', () => {
    it('returns false when no integrations exist', async () => {
      const result = await checkNextStepNecessary({
        currentStep: OnboardingStepKey.SetupIntegrations,
        workspace,
      })

      expect(result.ok).toBe(true)
      expect(result.unwrap()).toBe(false)
    })

    it('returns true when integrations exist', async () => {
      await factories.createIntegration({
        workspace,
        type: IntegrationType.Pipedream,
        configuration: {
          appName: 'slack',
          authType: 'oauth',
          metadata: {
            displayName: 'Slack',
          },
        },
      })

      const result = await checkNextStepNecessary({
        currentStep: OnboardingStepKey.SetupIntegrations,
        workspace,
      })

      expect(result.ok).toBe(true)
      const resultValue = result.unwrap()
      expect(resultValue).toBe(true)
    })
  })

  describe('ConfigureTriggers step', () => {
    it('returns false when no document triggers exist', async () => {
      const result = await checkNextStepNecessary({
        currentStep: OnboardingStepKey.ConfigureTriggers,
        workspace,
      })

      expect(result.ok).toBe(true)
      expect(result.unwrap()).toBe(false)
    })

    it('returns false when non-integration document triggers exist', async () => {
      const { project, commit } = await factories.createProject({
        workspace,
        documents: {
          'test.promptl': 'test content',
        },
      })

      await factories.createScheduledDocumentTrigger({
        workspaceId: workspace.id,
        projectId: project.id,
        commitId: commit.id,
      })

      const result = await checkNextStepNecessary({
        currentStep: OnboardingStepKey.ConfigureTriggers,
        workspace,
      })

      expect(result.ok).toBe(true)
      const resultValue = result.unwrap()
      expect(resultValue).toBe(false)
    })

    it('returns true when pending integration document triggers exist', async () => {
      const { project, commit } = await factories.createProject({
        workspace,
        documents: {
          'test.promptl': 'test content',
        },
      })

      const integration = await factories.createIntegration({
        workspace,
        type: IntegrationType.Pipedream,
        configuration: {
          appName: 'slack',
          authType: 'oauth',
        },
      })

      await factories.createIntegrationDocumentTrigger({
        workspaceId: workspace.id,
        projectId: project.id,
        commitId: commit.id,
        integrationId: integration.id,
        triggerStatus: DocumentTriggerStatus.Pending,
      })

      const result = await checkNextStepNecessary({
        currentStep: OnboardingStepKey.ConfigureTriggers,
        workspace,
      })

      expect(result.ok).toBe(true)
      const resultValue = result.unwrap()
      expect(resultValue).toBe(true)
    })

    it('returns true when integration document trigger was configured', async () => {
      const { project, commit } = await factories.createProject({
        workspace,
        documents: {
          'test.promptl': 'test content',
        },
      })

      const integration = await factories.createIntegration({
        workspace,
        type: IntegrationType.Pipedream,
        configuration: {
          appName: 'slack',
          authType: 'oauth',
        },
      })

      await factories.createIntegrationDocumentTrigger({
        workspaceId: workspace.id,
        projectId: project.id,
        commitId: commit.id,
        integrationId: integration.id,
        triggerStatus: DocumentTriggerStatus.Deployed,
      })

      const result = await checkNextStepNecessary({
        currentStep: OnboardingStepKey.ConfigureTriggers,
        workspace,
      })

      expect(result.ok).toBe(true)
      const resultValue = result.unwrap()
      expect(resultValue).toBe(true)
    })
  })

  describe('TriggerAgent step', () => {
    it('returns true (always necessary)', async () => {
      const result = await checkNextStepNecessary({
        currentStep: OnboardingStepKey.TriggerAgent,
        workspace,
      })

      expect(result.ok).toBe(true)
      const resultValue = result.unwrap()
      expect(resultValue).toBe(true)
    })
  })

  describe('RunAgent step', () => {
    it('returns true (always necessary)', async () => {
      const result = await checkNextStepNecessary({
        currentStep: OnboardingStepKey.RunAgent,
        workspace,
      })

      expect(result.ok).toBe(true)
      const resultValue = result.unwrap()
      expect(resultValue).toBe(true)
    })
  })
})
