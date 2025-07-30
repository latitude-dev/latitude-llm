import { ConfigurableProps, ConfiguredProps } from '@pipedream/sdk'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ConfigurablePropWithRemoteOptions,
  RemoteOptions,
} from '../../../../../constants'
import {
  validateAndDeployTriggerSchema,
  validateLattesChoices,
} from './validateAndDeployTriggerSchema'
import { Result } from '../../../../../lib/Result'
import { PipedreamIntegration } from '../../../../../browser'
import { IntegrationType } from '@latitude-data/constants'
import * as fetchFullConfigSchemaModule from './fetchFullConfigSchema'
import * as reloadComponentPropsModule from '../../../../integrations/pipedream/components/reloadComponentProps'
import { LatteInvalidChoiceError } from './configValidator'

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

describe('Validating and deploying schema', () => {
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
        remoteOptionValues: new RemoteOptions([
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
        ]),
      },
      {
        name: 'user',
        type: 'string',
        label: 'User',
        description: 'Select a user',
        remoteOptions: true,
        remoteOptionValues: new RemoteOptions([
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
        ]),
      },
      {
        name: 'keyword',
        type: 'string',
        label: 'Keyword',
        description: 'Keyword to monitor',
        optional: true,
      },
      {
        name: 'ignoreBot',
        type: 'boolean',
        label: 'Ignore Bots',
        description: 'Ignore messages from bots',
        default: false,
        optional: true,
      },
    ]
  })

  //   it('validates choices against the full schema', async () => {
  //     const isValid = await validateAndDeploySchema({
  //       lattesChoices: latteChosenConfiguredProps,
  //       fullTriggerConfigSchema,
  //     })

  //     expect(Result.isOk(isValid)).toBe(true)
  //   })
})
