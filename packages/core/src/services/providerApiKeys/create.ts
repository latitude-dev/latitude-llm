import pg from 'pg'
const { DatabaseError } = pg

import { Providers, User, Workspace } from '../../browser'
import { database } from '../../client'
import { publisher } from '../../events/publisher'
import {
  BadRequestError,
  databaseErrorCodes,
  Result,
  Transaction,
} from '../../lib'
import { providerApiKeys, ProviderConfiguration } from '../../schema'
import { amazonBedrockConfigurationSchema } from '../ai'

export type Props = {
  workspace: Workspace
  provider: Providers
  token: string
  url?: string
  name: string
  defaultModel?: string
  author: User
  configuration?: ProviderConfiguration<Providers> | undefined
}
export function createProviderApiKey(
  {
    workspace,
    provider,
    token,
    url,
    name,
    defaultModel,
    author,
    configuration,
  }: Props,
  db = database,
) {
  return Transaction.call(async (tx) => {
    if (provider === Providers.Custom && !url) {
      return Result.error(new BadRequestError('Custom provider requires a URL'))
    }

    if (defaultModel === '') {
      return Result.error(new BadRequestError('Default model cannot be empty'))
    }

    if (provider === Providers.AmazonBedrock) {
      if (!configuration) {
        return Result.error(
          new BadRequestError('AmazonBedrock provider requires configuration'),
        )
      } else {
        const result = amazonBedrockConfigurationSchema.safeParse(configuration)

        if (!result.success) {
          return Result.error(result.error)
        }
      }
    }

    try {
      const result = await tx
        .insert(providerApiKeys)
        .values({
          workspaceId: workspace.id!,
          provider,
          token,
          url,
          name,
          defaultModel,
          authorId: author.id,
          configuration,
        })
        .returning()

      publisher.publishLater({
        type: 'providerApiKeyCreated',
        data: {
          providerApiKey: result[0]!,
          workspaceId: workspace.id,
          userEmail: author.email,
        },
      })

      return Result.ok(result[0]!)
    } catch (error) {
      if (error instanceof DatabaseError) {
        if (error.code === databaseErrorCodes.uniqueViolation) {
          if (error.constraint?.includes('name')) {
            throw new BadRequestError(
              'A provider API key with this name already exists',
            )
          }

          if (error.constraint?.includes('token')) {
            throw new BadRequestError('This token is already in use')
          }
        }
      }

      throw error
    }
  }, db)
}
