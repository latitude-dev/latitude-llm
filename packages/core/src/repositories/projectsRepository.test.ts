import { beforeEach, describe, expect, it } from 'vitest'

import { Workspace } from '../browser'
import { Providers } from '../constants'
import { createProject, createWorkspace, helpers } from '../tests/factories'
import { ProjectsRepository } from './projectsRepository'

describe('ProjectsRepository', async () => {
  let repository: ProjectsRepository
  let workspace: Workspace

  const provider = { type: Providers.OpenAI, name: 'OpenAI' }

  beforeEach(async () => {
    const { workspace: newWorkspace } = await createWorkspace()
    workspace = newWorkspace
    repository = new ProjectsRepository(workspace.id)
  })

  describe('findAllActiveDocumentsWithAgreggatedData', () => {
    it('should return active projects with aggregated data', async () => {
      // Create test data
      const { project: project1 } = await createProject({
        workspace,
        providers: [provider],
        documents: {
          foo: helpers.createPrompt({ provider: provider.name }),
        },
      })

      const { project: project2 } = await createProject({
        workspace,
        documents: {
          bar: helpers.createPrompt({ provider: provider.name }),
        },
      })

      // Execute the method
      const result = await repository.findAllActiveDocumentsWithAgreggatedData()

      // Assert the result
      expect(result.ok).toBe(true)
      const projects = result.unwrap()

      expect(projects).toHaveLength(2)

      const project1Result = projects.find((p) => p.id === project1.id)
      expect(project1Result).toBeDefined()
      expect(project1Result?.documentCount).toBe(1)
      expect(project1Result?.lastCreatedAtDocument).toBeDefined()

      const project2Result = projects.find((p) => p.id === project2.id)
      expect(project2Result).toBeDefined()
      expect(project2Result?.documentCount).toBe(1)
      expect(project2Result?.lastCreatedAtDocument).toBeDefined()
    })

    it('should return projects with zero document count when no documents exist', async () => {
      const { project } = await createProject({
        workspace,
        providers: [provider],
      })

      const result = await repository.findAllActiveDocumentsWithAgreggatedData()

      expect(result.ok).toBe(true)
      const projects = result.unwrap()

      expect(projects).toHaveLength(1)
      expect(projects[0]?.id).toBe(project.id)
      expect(projects[0]?.documentCount).toBe(0)
      expect(projects[0]?.lastCreatedAtDocument).toBeNull()
    })

    it('should include projects without merged commits', async () => {
      await createProject({
        workspace,
        providers: [provider],
        skipMerge: true,
      })

      const result = await repository.findAllActiveDocumentsWithAgreggatedData()

      expect(result.ok).toBe(true)
      const projects = result.unwrap()

      expect(projects).toHaveLength(1)
    })
  })
})
