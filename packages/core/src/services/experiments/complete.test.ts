import { describe, it, expect, beforeEach } from 'vitest'
import { completeExperiment } from './complete'
import { database } from '../../client'
import { experiments } from '../../schema/models/experiments'
import { eq } from 'drizzle-orm'
import { createExperiment, createProject, helpers } from '../../tests/factories'
import { Providers } from '@latitude-data/constants'
import { type Commit } from '../../schema/models/types/Commit'
import { type Workspace } from '../../schema/models/types/Workspace'
import { type User } from '../../schema/models/types/User'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'

describe('completeExperiment', () => {
  let commit: Commit
  let document: DocumentVersion
  let user: User
  let workspace: Workspace

  beforeEach(async () => {
    const {
      documents: d,
      commit: c,
      user: u,
      workspace: w,
    } = await createProject({
      providers: [
        {
          name: 'openai',
          type: Providers.OpenAI,
        },
      ],
      documents: {
        doc: helpers.createPrompt({ provider: 'openai', model: 'gpt-4o' }),
      },
    })

    document = d[0]!
    commit = c
    user = u
    workspace = w
  })

  it('successfully completes an experiment', async () => {
    const { experiment } = await createExperiment({
      document,
      commit,
      evaluations: [],
      user,
      workspace,
    })

    const result = await completeExperiment(experiment)

    expect(result.ok).toBe(true)
    expect(result.value?.finishedAt).toBeInstanceOf(Date)

    // Verify the experiment was updated in the database
    const updatedExperiment = await database
      .select()
      .from(experiments)
      .where(eq(experiments.id, experiment.id))
      .limit(1)

    expect(updatedExperiment[0]?.finishedAt).toBeInstanceOf(Date)
  })
})
