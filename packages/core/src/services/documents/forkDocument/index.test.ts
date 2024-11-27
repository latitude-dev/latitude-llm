import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

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
import { forkDocument } from './index'
import { buildProjects } from './testHelpers/buildProjects'
import { generateDocumentsOutput } from './testHelpers/generateDocumentsOutput'

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

        it('fork document with default provider', async () => {
          const targetProject = await forkDocument({
            origin: { workspace: fromWorkspace, commit, document },
            destination: { workspace: toWorkspace, user },
          })
          const { commitCount, documents } = await generateDocumentsOutput({
            project: targetProject,
          })

          expect(targetProject.name).toBe('Copy of some-folder/parent')
          expect(commitCount).toBe(1)
          expect(documents).toEqual([
            {
              path: 'some-folder/parent',
              provider: 'google',
              model: 'gemini-1.5-flash',
            },
            {
              path: 'siblingParent/sibling',
              provider: 'google',
              model: 'gemini-1.5-flash',
            },
            {
              path: 'some-folder/children/child1',
              provider: 'google',
              model: 'gemini-1.5-flash',
            },
            {
              path: 'some-folder/children/child2',
              provider: 'google',
              model: 'gemini-1.5-flash',
            },
            {
              path: 'some-folder/children/childSibling',
              provider: 'google',
              model: 'gemini-1.5-flash',
            },
            {
              path: 'some-folder/children/grandchildren/grandchild1',
              provider: 'google',
              model: 'gemini-1.5-flash',
            },
            {
              path: 'some-folder/children/grandchildren/grandchild2',
              provider: 'google',
              model: 'gemini-1.5-flash',
            },
            {
              path: 'some-folder/children/grandchildren/grand-grand-grandChildren/deepestGrandChild',
              provider: 'google',
              model: 'gemini-1.5-flash',
            },
          ])
        })

        it('fork document with default model', async () => {
          const [_, provider] = destProviders
          await database
            .update(providerApiKeys)
            .set({
              defaultModel: 'gemini-1.0-pro',
            })
            .where(eq(providerApiKeys.id, provider!.id))
          const targetProject = await forkDocument({
            origin: { workspace: fromWorkspace, commit, document },
            destination: { workspace: toWorkspace, user },
          })
          const { commitCount, documents } = await generateDocumentsOutput({
            project: targetProject,
          })

          expect(commitCount).toBe(1)
          expect(documents[0]).toEqual({
            path: 'some-folder/parent',
            provider: 'google',
            model: 'gemini-1.0-pro',
          })
        })

        it('fork a nested document', async () => {
          const anotherDoc = originDocuments.find(
            (d) => d.path === 'some-folder/children/child1',
          )!
          const targetProject = await forkDocument({
            origin: { workspace: fromWorkspace, commit, document: anotherDoc },
            destination: { workspace: toWorkspace, user },
          })
          const { documents } = await generateDocumentsOutput({
            project: targetProject,
          })
          expect(documents).toEqual([
            {
              path: 'some-folder/children/child1',
              provider: 'google',
              model: 'gemini-1.5-flash',
            },
            {
              path: 'some-folder/children/childSibling',
              provider: 'google',
              model: 'gemini-1.5-flash',
            },
            {
              path: 'some-folder/children/grandchildren/grandchild1',
              provider: 'google',
              model: 'gemini-1.5-flash',
            },
            {
              path: 'some-folder/children/grandchildren/grandchild2',
              provider: 'google',
              model: 'gemini-1.5-flash',
            },
            {
              path: 'some-folder/children/grandchildren/grand-grand-grandChildren/deepestGrandChild',
              provider: 'google',
              model: 'gemini-1.5-flash',
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
        defaultProviderId: 'Latitude',
        defaultProviderApiKey: 'some-key',
      }).then((r) => r.unwrap())
      user = usr
      toWorkspace = wsp
    })

    it('fork document with Latitude provider', async () => {
      const targetProject = await forkDocument({
        origin: { workspace: fromWorkspace, commit, document },
        destination: { workspace: toWorkspace, user },
      })
      const { commitCount, documents } = await generateDocumentsOutput({
        project: targetProject,
      })

      expect(targetProject.name).toBe('Copy of some-folder/parent')
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
})
