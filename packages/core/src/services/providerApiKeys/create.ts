import pg from 'pg'
const { DatabaseError } = pg

import { Providers } from '@latitude-data/constants'
import { type User } from '../../schema/models/types/User'
import { type Workspace } from '../../schema/models/types/Workspace'
import { publisher } from '../../events/publisher'
import { BadRequestError, databaseErrorCodes } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import {
  providerApiKeys,
  ProviderConfiguration,
} from '../../schema/models/providerApiKeys'
import { amazonBedrockConfigurationSchema } from '../ai'
import { encryptProviderToken } from './helpers/tokenEncryption'
import { validateProviderApiKeyName } from './helpers/validateName'
import { serializeProviderApiKey } from './helpers/serializeProviderApiKey'

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
  transaction = new Transaction(),
) {
  return transaction.call(async (tx) => {
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
    const validatedNameResult = await validateProviderApiKeyName(
      {
        name,
        workspaceId: workspace.id,
      },
      tx,
    )

    if (!Result.isOk(validatedNameResult)) {
      return validatedNameResult
    }

    const validatedName = validatedNameResult.unwrap()

    try {
      const encryptedToken = encryptProviderToken(token)
      const result = await tx
        .insert(providerApiKeys)
        .values({
          workspaceId: workspace.id!,
          provider,
          token: encryptedToken,
          url,
          name: validatedName,
          defaultModel,
          authorId: author.id,
          configuration,
        })
        .returning()

      const providerApiKey = result[0]
      if (!providerApiKey) {
        return Result.error(new BadRequestError('Provider API key not created'))
      }

      const decryptedProviderApiKey = serializeProviderApiKey({
        ...providerApiKey,
        token: providerApiKey.token,
      })

      publisher.publishLater({
        type: 'providerApiKeyCreated',
        data: {
          providerApiKey: decryptedProviderApiKey,
          workspaceId: workspace.id,
          userEmail: author.email,
        },
      })

      return Result.ok(decryptedProviderApiKey)
    } catch (e) {
      const error = 'cause' in (e as Error) ? (e as Error).cause : undefined
      if (
        error instanceof DatabaseError &&
        error.code === databaseErrorCodes.uniqueViolation &&
        error.constraint?.includes('token')
      ) {
        throw new BadRequestError('This token is already in use')
      }

      throw e
    }
  })
}
