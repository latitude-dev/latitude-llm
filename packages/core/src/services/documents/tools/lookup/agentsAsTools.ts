import { resolveRelativePath } from '@latitude-data/constants'
import {
  BadRequestError,
  LatitudeError,
  NotFoundError,
} from '../../../../lib/errors'
import { PromisedResult } from '../../../../lib/Transaction'
import { Result, TypedResult } from '../../../../lib/Result'
import { ToolManifest, ToolManifestDict } from '@latitude-data/constants/tools'
import { ToolSource } from '@latitude-data/constants/toolSources'
import { type DocumentVersion } from '../../../../schema/models/types/DocumentVersion'
import { getToolDefinitionFromDocument } from '../../../../services/agents/agentsAsTools'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'

function findAgentDocs({
  agentPaths,
  documents,
}: {
  agentPaths: string[]
  documents: DocumentVersion[]
}): TypedResult<DocumentVersion[], LatitudeError> {
  const [agentDocs, notfoundPaths] = agentPaths.reduce(
    ([agentDocs, notFoundPaths]: [DocumentVersion[], string[]], agentPath) => {
      const doc = documents.find((doc) => doc.path === agentPath)
      if (doc) {
        agentDocs.push(doc)
      } else {
        notFoundPaths.push(agentPath)
      }
      return [agentDocs, notFoundPaths]
    },
    [[], []],
  )

  if (notfoundPaths.length) {
    return Result.error(
      new NotFoundError(`Documents not found: '${notfoundPaths.join("', '")}'`),
    )
  }

  const notActuallyAgents = agentDocs.filter(
    (doc) => doc.documentType !== 'agent',
  )
  if (notActuallyAgents.length) {
    return Result.error(
      new BadRequestError(
        notActuallyAgents.length === 1
          ? `Document '${notActuallyAgents[0]!.path}' is not an agent`
          : `Documents are not agents: '${notActuallyAgents.map((doc) => doc.path).join("', '")}'`,
      ),
    )
  }

  return Result.ok(agentDocs)
}

export async function lookupAgentsAsTools({
  config,
  documentUuid,
  documents,
}: {
  config: Pick<LatitudePromptConfig, 'agents'>
  documentUuid: string
  documents: DocumentVersion[]
}): PromisedResult<ToolManifestDict<ToolSource.Agent>, LatitudeError> {
  const { agents: relativeAgentPaths } = config
  if (!relativeAgentPaths?.length) return Result.ok({})

  const document = documents.find((doc) => doc.documentUuid === documentUuid)
  if (!document)
    return Result.error(
      new NotFoundError(`Document not found: '${documentUuid}'`),
    )

  const absoluteAgentPaths = relativeAgentPaths.map((relativeAgentPath) =>
    resolveRelativePath(relativeAgentPath, document.path),
  )
  const agentDocsResult = findAgentDocs({
    agentPaths: absoluteAgentPaths,
    documents,
  })
  if (agentDocsResult.error) return agentDocsResult

  const referenceFn = async (target: string, from?: string) => {
    const fullPath = from ? resolveRelativePath(from, target) : target
    const refDoc = documents.find((doc) => doc.path === fullPath)
    return refDoc
      ? {
          path: refDoc.path,
          content: refDoc.content,
        }
      : undefined
  }

  const agentDocs = agentDocsResult.unwrap()
  const resolvedToolsEntries: [string, ToolManifest<ToolSource.Agent>][] =
    await Promise.all(
      agentDocs.map(async (doc) => {
        const { name, toolDefinition } = await getToolDefinitionFromDocument({
          document: doc,
          referenceFn,
        })

        return [
          name,
          {
            definition: toolDefinition,
            sourceData: {
              source: ToolSource.Agent,
              agentPath: doc.path,
              documentUuid: doc.documentUuid,
            },
          },
        ]
      }),
    )

  return Result.ok(Object.fromEntries(resolvedToolsEntries))
}
