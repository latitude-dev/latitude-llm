import type { Message, ToolCall } from '@latitude-data/constants/messages'

import { type Commit } from '../../schema/models/types/Commit'
import { LogSources } from '../../constants'
import { findWorkspaceFromCommit } from '../../data-access/workspaces'
import { LegacyVercelSDKVersion4Usage as LanguageModelUsage } from '@latitude-data/constants'
import { publisher } from '../../events/publisher'
import { NotFoundError } from '../../lib/errors'
import { generateUUIDIdentifier } from '../../lib/generateUUID'
import { hashContent } from '../../lib/hashContent'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { documentLogs } from '../../schema/models/documentLogs'
import { createProviderLog } from '../providerLogs/create'

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
      experimentId,
    },
    commit,
  }: {
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
      experimentId?: number
    }
  },
  transaction = new Transaction(),
) {
  const workspace = await findWorkspaceFromCommit(commit)
  if (!workspace) {
    return Result.error(new NotFoundError('Workspace not found'))
  }

  return transaction.call(
    async (trx) => {
      const inserts = await trx
        .insert(documentLogs)
        .values({
          workspaceId: workspace.id,
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
          experimentId,
        })
        .returning()

      const documentLog = inserts[0]!

      if (providerLog) {
        await createProviderLog(
          {
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
          },
          transaction,
        ).then((r) => r.unwrap())
      }

      return Result.ok(documentLog)
    },
    async (documentLog) =>
      publisher.publishLater({
        type: 'documentLogCreated',
        data: {
          id: documentLog.id,
          workspaceId: workspace.id,
        },
      }),
  )
}
