import { describe, expect, it } from 'vitest'

import { Providers } from '../../browser'
import * as factories from '../../tests/factories'
import { deleteCommitDraft } from './delete'

describe('deleteCommitDraft', () => {
  it('should return a BadRequestError if there are associated logs or evaluations', async () => {
    const { workspace, project, user, providers } =
      await factories.createProject({ skipMerge: true })

    const provider = providers[0]!
    const { commit: draft } = await factories.createDraft({
      project,
      user,
    })

    const { documentVersion } = await factories.createDocumentVersion({
      workspace,
      user,
      commit: draft,
      path: 'patata/doc1',
      content: factories.helpers.createPrompt({ provider: provider.name }),
    })

    const { documentLog } = await factories.createDocumentLog({
      document: documentVersion,
      commit: draft,
    })

    await factories.createProviderLog({
      documentLogUuid: documentLog.uuid,
      providerId: provider.id,
      providerType: Providers.OpenAI,
    })

    const result = await deleteCommitDraft(draft)

    expect(result.ok).toBe(false)
    expect(result.error?.message).toBe(
      'Cannot delete this version because there are logs or evaluations associated with it.',
    )
  })

  it('should return an error if the commit is the only one in the project', async () => {
    const { commit } = await factories.createProject({
      skipMerge: true,
    })

    const result = await deleteCommitDraft(commit)

    expect(result.ok).toBe(false)
    expect(result.error?.message).toBe(
      'Cannot delete the only version in a project',
    )
  })
})
