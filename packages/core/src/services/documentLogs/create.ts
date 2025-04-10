import type { Message, ToolCall } from '@latitude-data/compiler'

import { Commit, DocumentLog, LogSources } from '../../browser'
import { database } from '../../client'
import { findWorkspaceFromCommit } from '../../data-access'
import { publisher } from '../../events/publisher'
import { documentLogs } from '../../schema'
import { createProviderLog } from '../providerLogs'
import { LanguageModelUsage } from 'ai'
import { generateUUIDIdentifier } from './../../lib/generateUUID'
import { hashContent } from './../../lib/hashContent'
import { NotFoundError } from './../../lib/errors'
import { Result } from './../../lib/Result'
import Transaction from './../../lib/Transaction'

export type CreateDocumentLogProps = {
  commit: Commit
  data: {
    uuid: string
    documentUuid: string
    parameters: Record<string, unknown>
    resolvedContent: string
    duration?: number
    source: LogSources
    customIdentifier?: string
    createdAt?: Date
    providerLog?: {
      messages: Message[]
      model?: string
      responseText?: string
      toolCalls?: ToolCall[]
      duration?: number
      usage?: LanguageModelUsage
      costInMillicents?: number
    }
  }
}

export async function createDocumentLog(
  {
    data: {
      uuid,
      documentUuid,
      resolvedContent,
      parameters,
      customIdentifier,
      duration,
      source,
      createdAt,
      providerLog,
    },
    commit,
  }: CreateDocumentLogProps,
  db = database,
) {
  return Transaction.call<DocumentLog>(async (trx) => {
    const inserts = await trx
      .insert(documentLogs)
      .values({
        uuid,
        documentUuid,
        commitId: commit.id,
        resolvedContent,
        contentHash: hashContent(resolvedContent),
        parameters,
        customIdentifier,
        duration,
        source,
        createdAt,
      })
      .returning()

    const documentLog = inserts[0]!
    if (providerLog) {
      const workspace = await findWorkspaceFromCommit(commit, trx)
      if (!workspace) {
        throw new NotFoundError('Workspace not found')
      }

      await createProviderLog({
        uuid: generateUUIDIdentifier(),
        documentLogUuid: documentLog.uuid,
        messages: providerLog.messages,
        responseText: providerLog.responseText,
        toolCalls: providerLog.toolCalls,
        generatedAt: new Date(),
        model: providerLog.model,
        duration: providerLog.duration,
        costInMillicents: providerLog.costInMillicents,
        usage: providerLog.usage,
        source,
        workspace,
      }).then((r) => r.unwrap())
    }

    publisher.publishLater({
      type: 'documentLogCreated',
      data: documentLog,
    })

    return Result.ok(documentLog)
  }, db)
}
