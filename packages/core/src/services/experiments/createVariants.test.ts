import { beforeEach, describe, expect, it } from 'vitest'
import {
  Commit,
  Dataset,
  DocumentVersion,
  EvaluationV2,
  Workspace,
  Providers,
} from '../../browser'
import * as factories from '../../tests/factories'
import { createExperimentVariants } from './createVariants'

describe('createExperimentVariants', () => {
  let workspace: Workspace
  let document: DocumentVersion
  let commit: Commit
  let dataset: Dataset
  const parametersMap = {
    a: 1,
    b: 2,
    c: 3,
  }
  let evaluations: EvaluationV2[]
  let datasetLabels: Record<string, string>

  beforeEach(async () => {
    const {
      user,
      workspace: createdWorkspace,
      commit: createdCommit,
      documents,
    } = await factories.createProject({
      providers: [
        { type: Providers.OpenAI, name: 'openai' },
        { type: Providers.Anthropic, name: 'anthropic' },
      ],
      documents: {
        doc1: factories.helpers.createPrompt({
          provider: 'openai',
          model: 'gpt-4o',
          content: 'content',
        }),
      },
    })
    workspace = createdWorkspace
    document = documents[0]!
    commit = createdCommit

    const { dataset: createdDataset } = await factories.createDataset({
      workspace,
      author: user,
      fileContent: factories.generateCsvContent({
        headers: ['a', 'b', 'c'],
        rows: Array.from({ length: 50 }).map((_, i) => [
          `a${i}`,
          `b${i}`,
          `c${i}`,
        ]),
      }),
    })
    dataset = createdDataset

    evaluations = await Promise.all([
      factories.createEvaluationV2({
        workspace,
        commit,
        document,
      }),
      factories.createEvaluationV2({
        workspace,
        commit,
        document,
      }),
      factories.createEvaluationV2({
        workspace,
        commit,
        document,
      }),
    ])

    datasetLabels = {
      [evaluations[0]!.uuid]: 'c',
      [evaluations[1]!.uuid]: 'c',
      [evaluations[2]!.uuid]: 'c',
    }
  })

  it('creates experiment variants with valid input', async () => {
    const variants = [
      {
        name: 'Variant 1',
        provider: 'openai',
        model: 'gpt-4o',
        temperature: 0,
      },
      {
        name: 'Variant 2',
        provider: 'openai',
        model: 'gpt-4o-mini',
        temperature: 1,
      },
      {
        name: 'Variant 3',
        provider: 'anthropic',
        model: 'claude-3',
        temperature: 2,
      },
    ]
    const result = await createExperimentVariants({
      workspace,
      commit,
      document,
      variants,
      evaluations,
      dataset,
      parametersMap,
      datasetLabels,
      fromRow: 0,
      toRow: 1,
    })

    expect(result.ok).toBe(true)
    const experiments = result.unwrap()
    expect(Array.isArray(experiments)).toBe(true)
    expect(experiments.length).toBe(3)

    const variant1 = experiments[0]!
    expect(variant1.name).toBe('Variant 1')
    expect(variant1.metadata.prompt).toContain('provider: openai')
    expect(variant1.metadata.prompt).toContain('model: gpt-4o')
    expect(variant1.metadata.prompt).toContain('temperature: 0')

    const variant2 = experiments[1]!
    expect(variant2.name).toBe('Variant 2')
    expect(variant2.metadata.prompt).toContain('provider: openai')
    expect(variant2.metadata.prompt).toContain('model: gpt-4o-mini')
    expect(variant2.metadata.prompt).toContain('temperature: 1')

    const variant3 = experiments[2]!
    expect(variant3.name).toBe('Variant 3')
    expect(variant3.metadata.prompt).toContain('provider: anthropic')
    expect(variant3.metadata.prompt).toContain('model: claude-3')
    expect(variant3.metadata.prompt).toContain('temperature: 2')
    expect(variant3.metadata.prompt).not.toContain('provider: openai')
    expect(variant3.metadata.prompt).not.toContain('model: gpt-4o')
  })

  it('fails when a provider is not found', async () => {
    const variants = [
      {
        name: 'Variant 1',
        provider: 'non-existing-provider',
        model: 'gpt-4o',
        temperature: 0,
      },
    ]
    const result = await createExperimentVariants({
      workspace,
      commit,
      document,
      variants,
      evaluations,
      dataset,
      parametersMap,
      datasetLabels,
      fromRow: 0,
      toRow: 1,
    })

    expect(result.ok).toBe(false)
    expect(result.error!.message).toContain(
      "The provider 'non-existing-provider' was not found in your workspace",
    )
  })
})
