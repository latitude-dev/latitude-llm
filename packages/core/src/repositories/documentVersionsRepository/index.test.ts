import { beforeEach, describe, expect, it } from 'vitest'

import { Providers } from '../../constants'
import { createProject, helpers } from '../../tests/factories'
import { DocumentVersionsRepository } from './index'

describe('DocumentVersionsRepository', () => {
  let repository: DocumentVersionsRepository
  let workspace1Id: number
  let commit1Id: number

  beforeEach(async () => {
    const { workspace: workspace1, commit: commit1 } = await createProject({
      providers: [{ type: Providers.OpenAI, name: 'OpenAI' }],
      documents: {
        foo: helpers.createPrompt({
          provider: 'OpenAI',
        }),
        bar: helpers.createPrompt({
          provider: 'OpenAI',
        }),
      },
    })

    await createProject({
      providers: [{ type: Providers.OpenAI, name: 'OpenAI' }],
      documents: {
        jon: helpers.createPrompt({
          provider: 'OpenAI',
        }),
        arya: helpers.createPrompt({
          provider: 'OpenAI',
        }),
      },
    })

    workspace1Id = workspace1.id
    commit1Id = commit1.id

    repository = new DocumentVersionsRepository(workspace1Id)
  })

  describe('findAll', () => {
    it('only returns documents from the specified workspace', async () => {
      const result = await repository.findAll()
      expect(result.ok).toBe(true)

      const documents = result.unwrap()
      expect(documents).toHaveLength(2)
      const paths = documents.map((d) => d.path).sort()
      expect(paths).toEqual(['bar', 'foo'])
      expect(documents.every((d) => d.commitId === commit1Id)).toBe(true)
    })

    it('returns an empty array for a different workspace', async () => {
      const differentWorkspaceRepository = new DocumentVersionsRepository(999) // Non-existent workspace ID
      const result = await differentWorkspaceRepository.findAll()
      expect(result.ok).toBe(true)

      const documents = result.unwrap()
      expect(documents).toHaveLength(0)
    })
  })
})
