import { database } from '../../../client'
import {
  ATTR_GEN_AI_REQUEST_PARAMETERS,
  ATTR_GEN_AI_REQUEST_TEMPLATE,
  ATTR_LATITUDE_PROMPT_PATH,
  HEAD_COMMIT,
  LogSources,
  SPAN_SPECIFICATIONS,
  SpanType,
} from '../../../constants'
import { Result } from '../../../lib/Result'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '../../../repositories'
import { SpanProcessArgs } from './shared'

const specification = SPAN_SPECIFICATIONS[SpanType.Prompt]
export const PromptSpanSpecification = {
  ...specification,
  process: process,
}

async function process(
  { attributes, workspace }: SpanProcessArgs<SpanType.Prompt>,
  db = database,
) {
  let parameters: Record<string, unknown>
  try {
    parameters = JSON.parse(
      attributes[ATTR_GEN_AI_REQUEST_PARAMETERS] as string,
    )
  } catch (error) {
    parameters = {}
  }

  // Get promptUuid from attributes, or try to resolve from promptPath
  let promptUuid = attributes['latitude.documentUuid'] as string | undefined
  const promptPath = attributes[ATTR_LATITUDE_PROMPT_PATH] as string | undefined
  const projectId = attributes['latitude.projectId'] as number | undefined
  const versionUuid =
    (attributes['latitude.commitUuid'] as string) || HEAD_COMMIT

  // If promptPath is provided but promptUuid is not, resolve it
  if (promptPath && !promptUuid && projectId) {
    const resolvedUuid = await resolvePromptPathToUuid({
      promptPath,
      projectId,
      versionUuid,
      workspaceId: workspace.id,
      db,
    })
    if (resolvedUuid) promptUuid = resolvedUuid
  }

  const result = {
    parameters,
    template: attributes[ATTR_GEN_AI_REQUEST_TEMPLATE] as string,
    externalId: attributes['latitude.externalId'] as string,

    // References
    experimentUuid: attributes['latitude.experimentUuid'] as string,
    promptUuid,
    promptPath,
    versionUuid,
    documentLogUuid: attributes['latitude.documentLogUuid'] as string,
    projectId,
    source: attributes['latitude.source'] as LogSources,
  }

  return Result.ok(result)
}

/**
 * Resolves a prompt path to its document UUID by looking up the document
 * in the specified project and version.
 */
async function resolvePromptPathToUuid({
  promptPath,
  projectId,
  versionUuid,
  workspaceId,
  db,
}: {
  promptPath: string
  projectId: number
  versionUuid: string
  workspaceId: number
  db: typeof database
}): Promise<string | undefined> {
  try {
    // Get the commit
    const commitsRepo = new CommitsRepository(workspaceId, db)
    const commitResult = await commitsRepo.getCommitByUuid({
      uuid: versionUuid,
      projectId,
    })
    if (commitResult.error) {
      return undefined
    }
    const commit = commitResult.value

    // Get the document by path
    const docsRepo = new DocumentVersionsRepository(workspaceId, db)
    const docResult = await docsRepo.getDocumentByPath({
      commit,
      path: promptPath,
    })
    if (docResult.error) {
      return undefined
    }

    return docResult.value.documentUuid
  } catch {
    return undefined
  }
}
