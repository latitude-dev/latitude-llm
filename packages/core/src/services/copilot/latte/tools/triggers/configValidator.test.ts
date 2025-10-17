import { PipedreamIntegration } from '../../../../../schema/models/types/Integration'
import { IntegrationType } from '@latitude-data/constants'
import * as fetchFullConfigSchemaModule from './fetchFullConfigSchema'
import * as reloadComponentPropsModule from '../../../../integrations/pipedream/components/reloadComponentProps'
import {
  ConfigurableProps,
  ConfiguredProps,
  PipedreamClient,
} from '@pipedream/sdk'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ConfigurablePropWithRemoteOptions,
  RemoteOptions,
} from '../../../../../constants'
import { Result } from '../../../../../lib/Result'
import { omit } from 'lodash-es'
import {
  isValidConfiguration,
  LatteInvalidChoiceError,
  validateLattesChoices,
} from './configValidator'

vi.mock('./fetchFullConfigSchema', () => ({
  fetchFullConfigSchema: vi.fn(),
  addRemoteOptions: vi.fn(),
  IRRELEVANT_PROP_TYPES: [
    'app',
    '$.service.db',
    '$.service.http',
    '$.interface.apphook',
    '$.interface.timer',
  ],
}))

vi.mock(
  '../../../../integrations/pipedream/components/reloadComponentProps',
  () => ({
    reloadComponentProps: vi.fn(),
  }),
)

describe('Validating schema', () => {
  let latteChosenConfiguredProps: ConfiguredProps<ConfigurableProps>
  let fullTriggerConfigSchema: ConfigurablePropWithRemoteOptions[]

  beforeEach(() => {
    latteChosenConfiguredProps = {
      conversations: ['AABBBCCCDDD'],
      user: '123ABC456',
      keyword: 'banana',
      ignoreBot: true,
    }

    fullTriggerConfigSchema = [
      {
        name: 'conversations',
        type: 'string[]',
        label: 'Channels',
        description: 'Select one or more channels to monitor for new messages.',
        remoteOptions: true,
        optional: true,
        remoteOptionValues: new RemoteOptions({
          options: [
            {
              label: 'Public channel: general',
              value: 'AABBBCCCDDD',
            },
            {
              label: 'Public channel: random',
              value: 'DDDEEEFFFGG',
            },
            {
              label: 'Public channel: development',
              value: 'HHHIIJJJKKK',
            },
          ],
        }),
      },
      {
        name: 'user',
        type: 'string',
        label: 'User',
        description: 'Select a user',
        remoteOptions: true,
        remoteOptionValues: new RemoteOptions({
          options: [
            {
              label: 'User: Pepe Sanchez',
              value: '123ABC456',
            },
            {
              label: 'User: Maria Lopez',
              value: 'ASD123DFG',
            },
            {
              label: 'User: John Doe',
              value: '1231234567',
            },
          ],
        }),
      },
      {
        name: 'keyword',
        type: 'string',
        label: 'Keyword',
        description: 'Keyword to monitor',
      },
      {
        name: 'ignoreBot',
        type: 'boolean',
        label: 'Ignore Bots',
        description: 'Ignore messages from bots',
        optional: true,
      },
    ]
  })

  describe('Validate Lattes choices', () => {
    const mockFetchFullConfigSchema = vi.mocked(
      fetchFullConfigSchemaModule.fetchFullConfigSchema,
    )
    const mockAddRemoteOptions = vi.mocked(
      fetchFullConfigSchemaModule.addRemoteOptions,
    )
    const mockReloadComponentProps = vi.mocked(
      reloadComponentPropsModule.reloadComponentProps,
    )

    let integration: PipedreamIntegration
    beforeEach(() => {
      integration = {
        id: 3,
        name: 'Notion',
        type: IntegrationType.Pipedream,
        hasTools: true,
        hasTriggers: true,
        configuration: {
          appName: 'notion',
          externalUserId: 'pd_u_abc123def456',
          authType: 'oauth',
          oauthAppId: 'pd_oauth_app_1234567890abcdef',
        },
        workspaceId: 1,
        authorId: 'usr_john_doe_123456',
        mcpServerId: null,
        lastUsedAt: new Date('2025-08-07T14:30:00.000Z'),
        deletedAt: null,
        createdAt: new Date('2025-08-01T09:15:00.000Z'),
        updatedAt: new Date('2025-08-07T14:30:00.000Z'),
      }
    })

    it('should return true for valid Lattes choices without reloadProps', async () => {
      mockFetchFullConfigSchema.mockResolvedValue(
        Result.ok(fullTriggerConfigSchema),
      )

      const result = await validateLattesChoices({
        componentId: 'notion',
        integration: integration,
        pipedream: {} as PipedreamClient,
        lattesChoices: latteChosenConfiguredProps,
      })

      expect(Result.isOk(result)).toBe(true)
    })

    it('should return false for invalid Lattes choices', async () => {
      mockFetchFullConfigSchema.mockResolvedValue(
        Result.ok(fullTriggerConfigSchema),
      )

      const invalidChoices = {
        ...latteChosenConfiguredProps,
        user: 'invalid_user',
      }

      const result = await validateLattesChoices({
        componentId: 'notion',
        integration: integration,
        pipedream: {} as PipedreamClient,
        lattesChoices: invalidChoices,
      })

      expect(Result.isOk(result)).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should return true for valid Lattes choices with reloadProps', async () => {
      const relevantLattePropsFromReload = {
        name: 'newProp',
        type: 'string[]' as const,
        description: 'A new prop added during reload',
      }

      const reloadedPropsResponse = {
        errors: [],
        dynamicProps: {
          id: 'test',
          configurableProps: [
            ...fullTriggerConfigSchema,
            relevantLattePropsFromReload,
          ],
        },
      }

      const modifiedSchema = fullTriggerConfigSchema.map((prop) =>
        prop.name === 'user' ? { ...prop, reloadProps: true } : prop,
      )

      mockFetchFullConfigSchema.mockResolvedValue(Result.ok(modifiedSchema))

      mockReloadComponentProps.mockResolvedValue(
        Result.ok(reloadedPropsResponse),
      )

      mockAddRemoteOptions.mockResolvedValue(
        Result.ok([
          {
            ...relevantLattePropsFromReload,
            remoteOptionValues: new RemoteOptions({
              options: [
                {
                  label: 'Option 1',
                  value: 'option1',
                },
                {
                  label: 'Option 2',
                  value: 'option2',
                },
              ],
            }),
          },
        ]),
      )

      const result = await validateLattesChoices({
        componentId: 'notion',
        integration: integration,
        pipedream: {} as PipedreamClient,
        lattesChoices: {
          ...latteChosenConfiguredProps,
          newProp: ['option1'],
        },
      })

      expect(Result.isOk(result)).toBe(true)
    })

    it('should return false for Lattes choices when reloadProps shows a new prop Latte didnt use', async () => {
      const relevantLattePropsFromReload = {
        name: 'newProp',
        type: 'string[]' as const,
        description: 'A new prop added during reload',
      }

      const reloadedPropsResponse = {
        errors: [],
        dynamicProps: {
          id: 'test',
          configurableProps: [
            ...fullTriggerConfigSchema,
            relevantLattePropsFromReload,
          ],
        },
      }

      const modifiedSchema = fullTriggerConfigSchema.map((prop) =>
        prop.name === 'user' ? { ...prop, reloadProps: true } : prop,
      )

      mockFetchFullConfigSchema.mockResolvedValue(Result.ok(modifiedSchema))

      mockReloadComponentProps.mockResolvedValue(
        Result.ok(reloadedPropsResponse),
      )

      mockAddRemoteOptions.mockResolvedValue(
        Result.ok([relevantLattePropsFromReload]),
      )

      const result = await validateLattesChoices({
        componentId: 'notion',
        integration: integration,
        pipedream: {} as PipedreamClient,
        lattesChoices: latteChosenConfiguredProps,
      })

      expect(Result.isOk(result)).toBe(false)
      expect(result.error).toBeDefined()
      const errorMessage = result.error as LatteInvalidChoiceError
      expect(errorMessage.errors).toHaveLength(1)
      expect(errorMessage.errors[0]).toContain(
        'Missing value for configured prop newProp',
      )
    })
  })

  describe('validateSchema', () => {
    it('should return true for schema with correct parameters', async () => {
      const result = await isValidConfiguration({
        lattesChoices: latteChosenConfiguredProps,
        fullTriggerConfigSchema,
      })

      expect(Result.isOk(result)).toBe(true)
    })

    it('should return true for schema with missing optional prop', async () => {
      const result = await isValidConfiguration({
        lattesChoices: omit(latteChosenConfiguredProps, 'ignoreBot'),
        fullTriggerConfigSchema,
      })
      expect(Result.isOk(result)).toBe(true)
    })

    it('should return false for schema with incorrect parameters due to not matching remoteOption values', async () => {
      const result = await isValidConfiguration({
        lattesChoices: {
          ...latteChosenConfiguredProps,
          user: 'different_user',
          conversations: ['wrong_channel'],
        },
        fullTriggerConfigSchema,
      })
      expect(Result.isOk(result)).toBe(false)
      expect(result.error).toBeDefined()
      const errorMessage = result.error as LatteInvalidChoiceError
      expect(errorMessage.errors).toHaveLength(2)
      expect(errorMessage.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining(
            'Invalid value for configured prop user with value different_user',
          ),
          expect.stringContaining(
            'Invalid value for configured prop conversations with value wrong_channel',
          ),
        ]),
      )
    })

    it('should return false for schema with incorrect parameters due to missing required prop', async () => {
      const result = await isValidConfiguration({
        lattesChoices: omit(latteChosenConfiguredProps, 'keyword'),
        fullTriggerConfigSchema,
      })
      expect(Result.isOk(result)).toBe(false)
      expect(result.error).toBeDefined()
      const errorMessage = result.error as LatteInvalidChoiceError
      expect(errorMessage.errors).toHaveLength(1)
      expect(
        errorMessage.errors.some((error) =>
          error.includes('Missing value for configured prop keyword'),
        ),
      ).toBe(true)
    })

    it('should return false for schema with incorrect parameters due to invalid type', async () => {
      const result = await isValidConfiguration({
        lattesChoices: {
          ...latteChosenConfiguredProps,
          keyword: 123,
          conversations: 'AABBBCCCDDD',
        },
        fullTriggerConfigSchema,
      })
      expect(Result.isOk(result)).toBe(false)
      expect(result.error).toBeDefined()
      const errorMessage = result.error as LatteInvalidChoiceError
      expect(errorMessage.errors).toHaveLength(2)
      expect(errorMessage.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining(
            'Invalid type for configured prop keyword. Expected string, but got number.',
          ),
          expect.stringContaining(
            'Invalid type for configured prop conversations. Expected string[], but got string.',
          ),
        ]),
      )
    })
  })
})
