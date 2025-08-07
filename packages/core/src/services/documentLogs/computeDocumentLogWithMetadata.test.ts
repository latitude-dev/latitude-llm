import { beforeEach, describe, expect, it } from 'vitest'

import {
  DocumentLog,
  ProviderApiKey,
  ProviderLog,
  Workspace,
} from '../../browser'
import * as factories from '../../tests/factories'
import { computeDocumentLogWithMetadata } from './computeDocumentLogWithMetadata'
import { NotFoundError } from './../../lib/errors'

describe('computeDocumentLogWithMetadata', () => {
  let workspace: Workspace
  let documentLog: DocumentLog
  let provider: ProviderApiKey
  let providerLogs: ProviderLog[]

  beforeEach(async () => {
    const setup = await factories.createProject()
    provider = setup.providers[0]!
    const { commit } = await factories.createDraft({
      project: setup.project,
      user: setup.user,
    })
    const { documentVersion } = await factories.createDocumentVersion({
      workspace: setup.workspace,
      user: setup.user,
      commit,
      path: 'folder1/doc1',
      content: factories.helpers.createPrompt({ provider, content: 'Doc 1' }),
    })
    const { documentLog: dl, providerLogs: _providerLogs } =
      await factories.createDocumentLog({
        document: documentVersion,
        commit,
      })

    workspace = setup.workspace
    documentLog = dl
    providerLogs = _providerLogs
  })

  it('returns DocumentLogWithMetadata when successful', async () => {
    const providerLog1 = await factories.createProviderLog({
      workspace,
      documentLogUuid: documentLog.uuid,
      providerId: provider.id,
      providerType: provider.provider,
      tokens: 100,
      duration: 1000,
      costInMillicents: 1250,
    })
    const providerLog2 = await factories.createProviderLog({
      workspace,
      documentLogUuid: documentLog.uuid,
      providerId: provider.id,
      providerType: provider.provider,
      tokens: 150,
      duration: 1500,
      costInMillicents: 1250,
    })

    const totalProviderLogs = [providerLog1, providerLog2, ...providerLogs]

    const result = await computeDocumentLogWithMetadata(documentLog)
    expect(result.value).toMatchObject({
      id: documentLog.id,
      uuid: documentLog.uuid,
      documentUuid: documentLog.documentUuid,
      tokens: totalProviderLogs.reduce(
        (acc, log) => acc + (log?.tokens ?? 0),
        0,
      ),
      duration: totalProviderLogs.reduce(
        (acc, log) => acc + (log?.duration ?? 0),
        0,
      ),
      costInMillicents: totalProviderLogs.reduce(
        (acc, log) => acc + log.costInMillicents,
        0,
      ),
    })
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
  })
})
