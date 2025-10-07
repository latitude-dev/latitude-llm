import { beforeEach, describe, expect, it } from 'vitest'
import { OnboardingStepKey } from '@latitude-data/constants/onboardingSteps'
import { Workspace } from '../../../../src/schema/types'
import * as factories from '../../../../src/tests/factories'
import { calculateAllSteps } from './calculateAllSteps'
import {
  DocumentTriggerStatus,
  IntegrationType,
} from '@latitude-data/constants'

describe('calculateAllSteps', () => {
  let workspace: Workspace

  beforeEach(async () => {
    const { workspace: createdWorkspace } = await factories.createWorkspace({
      onboarding: false,
    })
    workspace = createdWorkspace
  })

  it('should return all steps when there are pending configuration integrations and pending triggers', async () => {
    // Create a project with a merged commit
    const { project, commit } = await factories.createProject({
      workspace,
      documents: {
        'test.promptl': 'test content',
      },
    })

    // Create a Pipatedream integration
    const integration = await factories.createIntegration({
      workspace,
      type: IntegrationType.Pipedream,
      configuration: {
        appName: 'slack',
        authType: 'oauth',
      },
    })

    // Create a pending integration trigger
    await factories.createIntegrationDocumentTrigger({
      workspaceId: workspace.id,
      projectId: project.id,
      commitId: commit.id,
      integrationId: integration.id,
      triggerStatus: DocumentTriggerStatus.Pending,
    })

    const result = await calculateAllSteps({
      workspace,
    })

    expect(result.ok).toBe(true)
    const steps = result.unwrap()
    expect(steps).toEqual([
      OnboardingStepKey.SetupIntegrations,
      OnboardingStepKey.ConfigureTriggers,
      OnboardingStepKey.TriggerAgent,
      OnboardingStepKey.RunAgent,
    ])
  })

  it('should skip configure triggers when there are no pending configuration integrations', async () => {
    // Create a Pipedream integration
    await factories.createIntegration({
      workspace,
      type: IntegrationType.Pipedream,
      configuration: {
        appName: 'slack',
        authType: 'oauth',
      },
    })

    const result = await calculateAllSteps({
      workspace,
    })

    expect(result.ok).toBe(true)
    const steps = result.unwrap()
    expect(steps).toEqual([
      OnboardingStepKey.SetupIntegrations,
      OnboardingStepKey.TriggerAgent,
      OnboardingStepKey.RunAgent,
    ])
  })

  it('should skip configuring integrations or triggers when there are no pending configuration integrations and pending triggers', async () => {
    const result = await calculateAllSteps({
      workspace,
    })

    expect(result.ok).toBe(true)
    const steps = result.unwrap()
    expect(steps).toEqual([
      OnboardingStepKey.TriggerAgent,
      OnboardingStepKey.RunAgent,
    ])
  })

  it('should skip configuring integrations or triggers when there are only latitude triggers ', async () => {
    // Create a project with a merged commit
    const { project, commit } = await factories.createProject({
      workspace,
      documents: {
        'test.promptl': 'test content',
      },
    })

    // Create a scheduled trigger (non-integration)
    await factories.createScheduledDocumentTrigger({
      workspaceId: workspace.id,
      projectId: project.id,
      commitId: commit.id,
    })

    const result = await calculateAllSteps({
      workspace,
    })

    expect(result.ok).toBe(true)
    const steps = result.unwrap()
    expect(steps).toEqual([
      OnboardingStepKey.TriggerAgent,
      OnboardingStepKey.RunAgent,
    ])
  })

  it('Should set up integrations when there is an external MCP integration', async () => {
    // Create an external MCP integration
    await factories.createIntegration({
      workspace,
      type: IntegrationType.ExternalMCP,
      configuration: {
        url: 'https://example.com',
      },
    })

    const result = await calculateAllSteps({
      workspace,
    })

    expect(result.ok).toBe(true)
    const steps = result.unwrap()
    expect(steps).toEqual([
      OnboardingStepKey.SetupIntegrations,
      OnboardingStepKey.TriggerAgent,
      OnboardingStepKey.RunAgent,
    ])
  })
})
