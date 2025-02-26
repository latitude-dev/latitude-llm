'use server'

import { z } from 'zod'
import { authProcedure } from '../procedures'
import { deployMcpServer } from '@latitude-data/core/services/mcpServers/index'

export const createMcpServerAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      name: z.string(),
      runCommand: z.string(),
      environmentVariables: z.string(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    if (!input.runCommand.trim()) {
      throw new Error('Command cannot be empty')
    }

    // Parse environment variables whether they are comma-separated or newline-separated
    const envVarsInput = input.environmentVariables.includes('\n')
      ? input.environmentVariables.split('\n')
      : input.environmentVariables.split(',')

    const environmentVariables: Record<string, string> = {}

    envVarsInput
      .map((v) => v.trim())
      .filter(Boolean)
      .forEach((envVar) => {
        if (envVar.includes('=')) {
          const [key, ...valueParts] = envVar.split('=')
          const value = valueParts.join('=')
          if (key && value) {
            environmentVariables[key] = value
          } else {
            throw new Error(`Invalid environment variable format: ${envVar}`)
          }
        } else {
          throw new Error(`Invalid environment variable format: ${envVar}`)
        }
      })

    return await deployMcpServer({
      appName: input.name,
      environmentVariables,
      workspaceId: ctx.workspace.id,
      authorId: ctx.user.id,
      command: input.runCommand,
    }).then((r) => r.unwrap())
  })
