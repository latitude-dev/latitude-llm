import { randomUUID } from 'crypto'

import { beforeEach, describe, expect, it } from 'vitest'

import { type Commit } from '../schema/models/types/Commit'
import { type DocumentVersion } from '../schema/models/types/DocumentVersion'
import { type ProviderApiKey } from '../schema/models/types/ProviderApiKey'
import { type Workspace } from '../schema/models/types/Workspace'
import { LogSources, Providers } from '@latitude-data/constants'
import { NotFoundError } from '../lib/errors'
import * as factories from '../tests/factories'
import { ProviderLogsRepository } from './providerLogsRepository'

describe('ProviderLogsRepository', () => {
  let workspace: Workspace
  let document: DocumentVersion
  let commit: Commit
  let provider: ProviderApiKey
  let providerLogsRepository: ProviderLogsRepository

  beforeEach(async () => {
    const {
      workspace: createdWorkspace,
      commit: createdCommit,
      documents,
      providers,
    } = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        doc1: factories.helpers.createPrompt({
          provider: 'openai',
          content: 'content',
        }),
      },
    })
    workspace = createdWorkspace
    document = documents[0]!
    commit = createdCommit
    provider = providers[0]!
    providerLogsRepository = new ProviderLogsRepository(workspace.id)
  })

  describe('findByUuid', () => {
    it('returns the provider log when found', async () => {
      const { documentLog } = await factories.createDocumentLog({
        document,
        commit,
      })

      const providerLog = await factories.createProviderLog({
        workspace,
        documentLogUuid: documentLog.uuid,
        providerId: provider.id,
        providerType: provider.provider,
        source: LogSources.Playground,
      })

      const result = await providerLogsRepository.findByUuid(providerLog.uuid)

      expect(result.ok).toBe(true)
      expect(result.unwrap()).toEqual(
        expect.objectContaining({
          uuid: providerLog.uuid,
          workspaceId: workspace.id,
        }),
      )
    })

    it('returns a NotFoundError when the provider log is not found', async () => {
      const result = await providerLogsRepository.findByUuid(randomUUID())

      expect(result.ok).toBe(false)
      expect(() => result.unwrap()).toThrowError(NotFoundError)
    })
  })

  describe('findByDocumentUuid', () => {
    it('returns provider logs for a document', async () => {
      const documentUuid = document.documentUuid
      const { documentLog } = await factories.createDocumentLog({
        document,
        commit,
      })

      const providerLog = await factories.createProviderLog({
        workspace,
        documentLogUuid: documentLog.uuid,
        providerId: provider.id,
        providerType: provider.provider,
        source: LogSources.Playground,
      })

      const result =
        await providerLogsRepository.findByDocumentUuid(documentUuid)

      expect(result.ok).toBe(true)
      expect(result.unwrap()).toContainEqual(
        expect.objectContaining({
          uuid: providerLog.uuid,
          documentLogUuid: documentLog.uuid,
        }),
      )
    })
  })

  describe('findLastByDocumentLogUuid', () => {
    it('returns the latest provider log for a document log', async () => {
      const { documentLog } = await factories.createDocumentLog({
        document,
        commit,
        skipProviderLogs: true,
      })

      const firstLog = await factories.createProviderLog({
        workspace,
        documentLogUuid: documentLog.uuid,
        providerId: provider.id,
        providerType: provider.provider,
        source: LogSources.Playground,
        generatedAt: new Date('2024-01-01'),
      })

      const lastLog = await factories.createProviderLog({
        workspace,
        documentLogUuid: documentLog.uuid,
        providerId: provider.id,
        providerType: provider.provider,
        source: LogSources.Playground,
        generatedAt: new Date('2024-01-02'),
      })

      const result = await providerLogsRepository.findLastByDocumentLogUuid(
        documentLog.uuid,
      )

      expect(result.ok).toBe(true)
      expect(result.unwrap().uuid).toBe(lastLog.uuid)
      expect(result.unwrap().uuid).not.toBe(firstLog.uuid)
    })

    it('returns a NotFoundError when the document log is not found', async () => {
      const result =
        await providerLogsRepository.findLastByDocumentLogUuid(randomUUID())

      expect(result.ok).toBe(false)
      expect(() => result.unwrap()).toThrowError(NotFoundError)
    })

    it('returns an error when documentLogUuid is undefined', async () => {
      const result =
        await providerLogsRepository.findLastByDocumentLogUuid(undefined)

      expect(result.ok).toBe(false)
      expect(() => result.unwrap()).toThrowError(NotFoundError)
    })
  })

  describe('findByDocumentLogUuid', () => {
    it('returns all provider logs for a document log', async () => {
      const { documentLog } = await factories.createDocumentLog({
        document,
        commit,
        skipProviderLogs: true,
      })

      const firstLog = await factories.createProviderLog({
        workspace,
        documentLogUuid: documentLog.uuid,
        providerId: provider.id,
        providerType: provider.provider,
        source: LogSources.Playground,
        generatedAt: new Date('2024-01-01'),
      })

      const secondLog = await factories.createProviderLog({
        workspace,
        documentLogUuid: documentLog.uuid,
        providerId: provider.id,
        providerType: provider.provider,
        source: LogSources.Playground,
        generatedAt: new Date('2024-01-02'),
      })

      const result = await providerLogsRepository.findByDocumentLogUuid(
        documentLog.uuid,
      )

      expect(result.ok).toBe(true)
      const logs = result.unwrap()
      expect(logs).toHaveLength(2)
      expect(logs.map((log) => log.uuid)).toEqual(
        expect.arrayContaining([firstLog.uuid, secondLog.uuid]),
      )
    })

    it('respects limit and offset options', async () => {
      const { documentLog } = await factories.createDocumentLog({
        document,
        commit,
      })

      await Promise.all(
        Array.from({ length: 3 }).map(() =>
          factories.createProviderLog({
            workspace,
            documentLogUuid: documentLog.uuid,
            providerId: provider.id,
            providerType: provider.provider,
            source: LogSources.Playground,
          }),
        ),
      )

      const result = await providerLogsRepository.findByDocumentLogUuid(
        documentLog.uuid,
        { limit: 2, offset: 1 },
      )

      expect(result.ok).toBe(true)
      expect(result.unwrap()).toHaveLength(2)
    })
  })
})
