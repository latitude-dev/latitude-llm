import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import {
  Commit,
  DocumentVersion,
  ProviderApiKey,
  Providers,
  User,
  Workspace,
} from '../../../browser'
import { database } from '../../../client'
import { providerApiKeys } from '../../../schema'
import * as factories from '../../../tests/factories'
import setupService from '../../users/setupService'
import { forkDocument } from '../forkDocument'
import { buildProjects } from './testHelpers/buildProjects'
import { generateDocumentsOutput } from './testHelpers/generateDocumentsOutput'

const publisherSpy = vi.spyOn(
  await import('../../../events/publisher').then((f) => f.publisher),
  'publishLater',
)

let fromWorkspace: Workspace
let toWorkspace: Workspace
let commit: Commit
let user: User
let originDocuments: DocumentVersion[]
let document: DocumentVersion
let destProviders: ProviderApiKey[]

describe('forkDocument', () => {
  beforeAll(async () => {
    const {
      workspace: wsp,
      document: doc,
      commit: cmt,
      documents,
    } = await buildProjects()
    fromWorkspace = wsp
    originDocuments = documents
    document = doc
    commit = cmt
  })

  describe('Existing workspace', () => {
    beforeAll(async () => {
      const { workspace: tWp, userData } = await factories.createWorkspace()
      toWorkspace = tWp
      user = userData
    })

    describe('With providers', () => {
      beforeAll(async () => {
        // Another provider
        destProviders = await Promise.all([
          await factories.createProviderApiKey({
            workspace: toWorkspace,
            type: Providers.OpenAI,
            name: 'openAI',
            user,
          }),
          await factories.createProviderApiKey({
            workspace: toWorkspace,
            type: Providers.Google,
            name: 'google',
            user,
          }),
        ])
      })

      describe('With default provider', () => {
        beforeAll(async () => {
          const [_, provider] = destProviders
          toWorkspace = await factories
            .setProviderAsDefault(toWorkspace, provider!)
            .then((r) => r.unwrap())
        })

        it('publish event', async () => {
          await forkDocument({
            title: 'Copied Prompt',
            origin: {
              workspace: fromWorkspace,
              commit,
              document,
            },
            destination: { workspace: toWorkspace, user },
          }).then((r) => r.unwrap())
          expect(publisherSpy).toHaveBeenCalledWith({
            type: 'forkDocumentRequested',
            data: {
              origin: {
                workspaceId: fromWorkspace.id,
                commitUuid: commit.uuid,
                documentUuid: document.documentUuid,
              },
              destination: {
                workspaceId: toWorkspace.id,
                userEmail: user.email,
              },
            },
          })
        })
      })

      describe('project title', () => {
        it('add copy of to prompt name as project name', async () => {
          const anotherDoc = originDocuments.find(
            (d) => d.path === 'some-folder/children/grandchildren/grandchild2',
          )!
          const { project } = await forkDocument({
            title: 'Original Prompt',
            origin: {
              workspace: fromWorkspace,
              commit,
              document: anotherDoc,
            },
            destination: { workspace: toWorkspace, user },
          }).then((r) => r.unwrap())

          expect(project.name).toBe('Copy of Original Prompt')
        })

        it('add copy of and (1) when a project name exists with that name', async () => {
          const anotherDoc = originDocuments.find(
            (d) => d.path === 'some-folder/children/grandchildren/grandchild2',
          )!
          await factories.createProject({
            workspace: toWorkspace,
            name: 'Copy of Original Prompt',
          })
          const { project } = await forkDocument({
            title: 'Original Prompt',
            origin: {
              workspace: fromWorkspace,
              commit,
              document: anotherDoc,
            },
            destination: { workspace: toWorkspace, user },
          }).then((r) => r.unwrap())

          expect(project.name).toBe('Copy of Original Prompt (1)')
        })

        it('add copy of and (2) when a project name exists with that name', async () => {
          const anotherDoc = originDocuments.find(
            (d) => d.path === 'some-folder/children/grandchildren/grandchild2',
          )!
          await factories.createProject({
            workspace: toWorkspace,
            name: 'Copy of Original Prompt',
          })
          await factories.createProject({
            workspace: toWorkspace,
            name: 'Copy of Original Prompt (1)',
          })
          const { project } = await forkDocument({
            title: 'Original Prompt',
            origin: {
              workspace: fromWorkspace,
              commit,
              document: anotherDoc,
            },
            destination: { workspace: toWorkspace, user },
          }).then((r) => r.unwrap())

          expect(project.name).toBe('Copy of Original Prompt (2)')
        })

        it('add copy of and (3) when a project name exists with that name', async () => {
          const anotherDoc = originDocuments.find(
            (d) => d.path === 'some-folder/children/grandchildren/grandchild2',
          )!
          await factories.createProject({
            workspace: toWorkspace,
            name: 'Copy of Original Prompt',
          })
          await factories.createProject({
            workspace: toWorkspace,
            name: 'Copy of Original Prompt (1)',
          })
          await factories.createProject({
            workspace: toWorkspace,
            name: 'Copy of Original Prompt (2)',
          })
          const { project } = await forkDocument({
            title: 'Original Prompt',
            origin: {
              workspace: fromWorkspace,
              commit,
              document: anotherDoc,
            },
            destination: { workspace: toWorkspace, user },
          }).then((r) => r.unwrap())

          expect(project.name).toBe('Copy of Original Prompt (3)')
        })
      })

      it('fork document with default provider', async () => {
        const { project } = await forkDocument({
          title: 'Original Prompt',
          origin: { workspace: fromWorkspace, commit, document },
          destination: { workspace: toWorkspace, user },
        }).then((r) => r.unwrap())
        const { commitCount, documents } = await generateDocumentsOutput({
          project,
        })

        expect(project.name).toBe('Copy of Original Prompt')
        expect(commitCount).toBe(1)
        expect(documents).toEqual([
          {
            path: 'some-folder/parent',
            provider: 'google',
            model: 'gemini-2.5-pro',
          },
          {
            path: 'siblingParent/sibling',
            provider: 'google',
            model: 'gemini-2.5-pro',
          },
          {
            path: 'some-folder/children/child1',
            provider: 'google',
            model: 'gemini-2.5-pro',
          },
          {
            path: 'some-folder/children/child2',
            provider: 'google',
            model: 'gemini-2.5-pro',
          },
          {
            path: 'some-folder/children/childSibling',
            provider: 'google',
            model: 'gemini-2.5-pro',
          },
          {
            path: 'some-folder/children/grandchildren/grandchild1',
            provider: 'google',
            model: 'gemini-2.5-pro',
          },
          {
            path: 'some-folder/children/grandchildren/grandchild2',
            provider: 'google',
            model: 'gemini-2.5-pro',
          },
          {
            path: 'some-folder/children/grandchildren/grand-grand-grandChildren/deepestGrandChild',
            provider: 'google',
            model: 'gemini-2.5-pro',
          },
        ])
      })

      it('fork a nested document', async () => {
        const anotherDoc = originDocuments.find(
          (d) => d.path === 'some-folder/children/child1',
        )!
        const { project } = await forkDocument({
          title: 'Copied Prompt',
          origin: { workspace: fromWorkspace, commit, document: anotherDoc },
          destination: { workspace: toWorkspace, user },
        }).then((r) => r.unwrap())
        const { documents } = await generateDocumentsOutput({
          project,
        })
        expect(documents).toEqual([
          {
            path: 'agents/agent1',
            provider: 'google',
            model: 'gemini-2.5-pro',
          },
          {
            path: 'agents/agent2',
            provider: 'google',
            model: 'gemini-2.5-pro',
          },
          {
            path: 'agents/subagent1',
            provider: 'google',
            model: 'gemini-2.5-pro',
          },
          {
            path: 'agents/subagent2',
            provider: 'google',
            model: 'gemini-2.5-pro',
          },
          {
            path: 'some-folder/children/child1',
            provider: 'google',
            model: 'gemini-2.5-pro',
          },
          {
            path: 'some-folder/children/childSibling',
            provider: 'google',
            model: 'gemini-2.5-pro',
          },
          {
            path: 'some-folder/children/grandchildren/grandchild1',
            provider: 'google',
            model: 'gemini-2.5-pro',
          },
          {
            path: 'some-folder/children/grandchildren/grandchild2',
            provider: 'google',
            model: 'gemini-2.5-pro',
          },
          {
            path: 'some-folder/children/grandchildren/grand-grand-grandChildren/deepestGrandChild',
            provider: 'google',
            model: 'gemini-2.5-pro',
          },
        ])
      })
    })
  })
})

describe('New workspace', () => {
  beforeAll(async () => {
    const { user: usr, workspace: wsp } = await setupService({
      name: 'Alice',
      email: 'alice@example.com',
      companyName: 'Alice Company',
      defaultProviderName: 'Latitude',
      defaultProviderApiKey: 'some-key',
      importDefaultProject: false,
    }).then((r) => r.unwrap())
    user = usr
    toWorkspace = wsp
  })

  it('fork document with Latitude provider', async () => {
    const { project } = await forkDocument({
      title: 'Original Prompt',
      origin: { workspace: fromWorkspace, commit, document },
      destination: { workspace: toWorkspace, user },
    }).then((r) => r.unwrap())
    const { commitCount, documents } = await generateDocumentsOutput({
      project,
    })

    expect(project.name).toBe('Copy of Original Prompt')
    expect(commitCount).toBe(1)
    expect(documents).toEqual([
      {
        path: 'some-folder/parent',
        provider: 'Latitude',
        model: 'gpt-4o-mini',
      },
      {
        path: 'siblingParent/sibling',
        provider: 'Latitude',
        model: 'gpt-4o-mini',
      },
      {
        path: 'some-folder/children/child1',
        provider: 'Latitude',
        model: 'gpt-4o-mini',
      },
      {
        path: 'some-folder/children/child2',
        provider: 'Latitude',
        model: 'gpt-4o-mini',
      },
      {
        path: 'some-folder/children/childSibling',
        provider: 'Latitude',
        model: 'gpt-4o-mini',
      },
      {
        path: 'some-folder/children/grandchildren/grandchild1',
        provider: 'Latitude',
        model: 'gpt-4o-mini',
      },
      {
        path: 'some-folder/children/grandchildren/grandchild2',
        provider: 'Latitude',
        model: 'gpt-4o-mini',
      },
      {
        path: 'some-folder/children/grandchildren/grand-grand-grandChildren/deepestGrandChild',
        provider: 'Latitude',
        model: 'gpt-4o-mini',
      },
    ])
  })
})
