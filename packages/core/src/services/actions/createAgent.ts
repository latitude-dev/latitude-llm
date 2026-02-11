import { env } from '@latitude-data/env'
import { z } from 'zod'
import { cache as getCache } from '../../cache'
import { database } from '../../client'
import {
  ActionType,
  CLOUD_MESSAGES,
  createAgentActionBackendParametersSchema,
} from '../../constants'
import { queues } from '../../jobs/queues'
import { BadRequestError, UnprocessableEntityError } from '../../lib/errors'
import { hashContent } from '../../lib/hashContent'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { findAllActiveProjects } from '../../queries/projects/findAllActive'
import { type Workspace } from '../../schema/models/types/Workspace'
import { runCopilot } from '../copilot'
import { createProject } from '../projects/create'
import { ActionExecuteArgs } from './shared'

export const CreateAgentActionSpecification = {
  parameters: createAgentActionBackendParametersSchema,
  execute: execute,
}

async function execute(
  { parameters, user, workspace }: ActionExecuteArgs<ActionType.CreateAgent>,
  db = database,
  tx = new Transaction(),
) {
  if (parameters.prompt.length < 1 || parameters.prompt.length > 2500) {
    return Result.error(
      new BadRequestError('Prompt must be between 1 and 2500 characters'),
    )
  }

  const prompt = `
Latte can you create me an agent for the following use case please?
${parameters.prompt}
`.trim()

  let name = 'New Agent' // Note: generating project name asynchronously
  const ensuring = await ensureAgentName({ name, workspace }, db)
  if (ensuring.error) {
    return Result.error(ensuring.error)
  }
  name = ensuring.unwrap().name

  const creating = await createProject({ name, user, workspace }, tx)
  if (creating.error) {
    return Result.error(creating.error)
  }
  const { project, commit } = creating.unwrap()

  try {
    const { defaultQueue } = await queues()
    defaultQueue.add('generateProjectNameJob', {
      workspaceId: workspace.id,
      projectId: project.id,
      prompt: prompt,
    })
  } catch (_error) {
    // Note: doing nothing
  }

  return Result.ok({
    projectId: project.id,
    commitUuid: commit.uuid,
    prompt: prompt,
  })
}

const generatorSchema = z.object({
  name: z.string(),
  description: z.string(),
})
type AgentDetails = z.infer<typeof generatorSchema>

const generatorKey = (prompt: string) =>
  `agents:details:generator:${hashContent(prompt)}`

export async function generateAgentDetails(
  { prompt }: { prompt: string },
  db = database,
) {
  if (!env.LATITUDE_CLOUD) {
    return Result.error(
      new UnprocessableEntityError(CLOUD_MESSAGES.generateAgentDetails),
    )
  }

  let details: AgentDetails | undefined

  const cache = await getCache()
  try {
    const key = generatorKey(prompt)
    const item = await cache.get(key)
    if (item) details = JSON.parse(item)
  } catch (_) {
    // Note: doing nothing
  }
  if (details) return Result.ok(details)

  if (!env.COPILOT_PROMPT_AGENT_DETAILS_GENERATOR_PATH) {
    return Result.error(
      new UnprocessableEntityError(
        'COPILOT_PROMPT_AGENT_DETAILS_GENERATOR_PATH is not set',
      ),
    )
  }

  const generating = await runCopilot({
    path: env.COPILOT_PROMPT_AGENT_DETAILS_GENERATOR_PATH,
    parameters: { prompt },
    schema: generatorSchema,
    db,
  })
  if (generating.error) {
    return Result.error(generating.error)
  }
  details = generating.unwrap()

  try {
    const key = generatorKey(prompt)
    const item = JSON.stringify(details)
    await cache.set(key, item)
  } catch (_) {
    // Note: doing nothing
  }

  return Result.ok(details)
}

export async function ensureAgentName(
  {
    name,
    workspace,
  }: {
    name: string
    workspace: Workspace
  },
  db = database,
) {
  const finding = await findAllActiveProjects({ workspaceId: workspace.id }, db)
  if (finding.error) {
    return Result.error(finding.error as Error)
  }
  const projects = finding.unwrap()

  const existing = projects.filter((project) =>
    project.name.startsWith(name),
  ).length
  if (!existing) {
    return Result.ok({ name })
  }

  return Result.ok({ name: `${name} (${existing})` })
}
