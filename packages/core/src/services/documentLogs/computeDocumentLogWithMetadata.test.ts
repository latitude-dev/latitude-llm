import { beforeEach, describe, expect, it } from 'vitest'

import {
  DocumentLog,
  ProviderApiKey,
  ProviderLog,
  Providers,
  Workspace,
} from '../../browser'
import { NotFoundError } from '../../lib'
import * as factories from '../../tests/factories'
import { computeDocumentLogWithMetadata } from './computeDocumentLogWithMetadata'

describe('computeDocumentLogWithMetadata', () => {
  let documentLog: DocumentLog
  let workspace: Workspace
  let provider: ProviderApiKey
  let providerLogs: ProviderLog[]

  beforeEach(async () => {
    const setup = await factories.createProject()
    workspace = setup.workspace
    provider = await factories.createProviderApiKey({
      workspace,
      type: Providers.OpenAI,
      name: 'foo',
      user: setup.user,
    })
    const { commit } = await factories.createDraft({
      project: setup.project,
      user: setup.user,
    })
    const { documentVersion } = await factories.createDocumentVersion({
      commit,
      content: `
      ---
      provider: ${provider.name}
      model: 'gpt-4o-mini'
      ---
      `,
    })
    const { documentLog: dl, providerLogs: _providerLogs } =
      await factories.createDocumentLog({
        document: documentVersion,
        commit,
      })

    documentLog = dl
    providerLogs = _providerLogs
  })

  it('returns DocumentLogWithMetadata when successful', async () => {
    // Create provider logs for the document log
    const providerLog1 = await factories.createProviderLog({
      documentLogUuid: documentLog.uuid,
      providerId: provider.id,
      providerType: provider.provider,
      tokens: 100,
      duration: 1000,
      costInMillicents: 1250,
    })
    const providerLog2 = await factories.createProviderLog({
      documentLogUuid: documentLog.uuid,
      providerId: provider.id,
      providerType: provider.provider,
      tokens: 150,
      duration: 1500,
      costInMillicents: 1250,
    })

    const totalProviderLogs = [providerLog1, providerLog2, ...providerLogs]

    const result = await computeDocumentLogWithMetadata(documentLog)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toMatchObject({
        id: documentLog.id,
        uuid: documentLog.uuid,
        documentUuid: documentLog.documentUuid,
        tokens: totalProviderLogs.reduce((acc, log) => acc + log.tokens, 0),
        duration: totalProviderLogs.reduce((acc, log) => acc + log.duration, 0),
        costInMillicents: totalProviderLogs.reduce(
          (acc, log) => acc + log.costInMillicents,
          0,
        ),
      })
    }
  })

  it('returns NotFoundError when document log is not found', async () => {
    // Create a non-existent document log
    const nonExistentDocumentLog: DocumentLog = {
      ...documentLog,
      id: 999999,
      uuid: 'non-existent-uuid',
    }

    const result = await computeDocumentLogWithMetadata(nonExistentDocumentLog)

    expect(result.ok).toBe(false)
    expect(result.error).toBeInstanceOf(NotFoundError)
    expect(result.error?.message).toBe('Document log not found')
  })
})
