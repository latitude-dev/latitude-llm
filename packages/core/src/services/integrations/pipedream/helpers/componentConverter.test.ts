import { describe, expect, beforeEach } from 'vitest'
import {
  PipedreamComponent,
  PipedreamComponentType,
} from '../../../../constants'
import { McpTool } from '@latitude-data/constants'
import { it } from 'vitest'
import { pipedreamComponentToTriggerDefinition } from './componentConverter'

describe('Component Converter Tests', () => {
  describe('Pipedream component to trigger definition', () => {
    let exampleTrigger: PipedreamComponent<PipedreamComponentType.Trigger>

    beforeEach(() => {
      exampleTrigger = {
        name: 'New or Updated Page in Database (By Property)',
        description:
          'Emit new event when a page is created or updated in the selected database. [See the documentation](https://developers.notion.com/reference/page)',
        version: '0.1.8',
        key: 'notion-updated-page',
        component_type: PipedreamComponentType.Trigger,
        configurable_props: [
          {
            name: 'notion',
            type: 'app',
            app: 'notion',
          },
          {
            name: 'db',
            type: '$.service.db',
          },
          {
            name: 'timer',
            type: '$.interface.timer',
            default: {
              intervalSeconds: 900,
            },
          },
          {
            name: 'alert',
            type: 'alert',
            alertType: 'warning',
            content:
              'Source not saving? Your database might be too large. If deployment takes longer than one minute, an error will occur.',
          },
        ],
      }
    })

    it.only('should convert a simple component', () => {
      const expectedResult = {
        name: 'notion-updated-page',
        description:
          'Emit new event when a page is created or updated in the selected database. [See the documentation](https://developers.notion.com/reference/page)',
        inputSchema: {
          type: 'object',
          properties: {
            db: {
              title: 'db',
              type: 'object',
              additionalProperties: true,
              description: undefined,
            },
            timer: {
              title: 'timer',
              default: {
                intervalSeconds: 900,
              },
              description: undefined,
              oneOf: [
                {
                  type: 'object',
                  properties: {
                    intervalSeconds: {
                      type: 'integer',
                      minimum: 1,
                    },
                  },
                  required: ['intervalSeconds'],
                  additionalProperties: false,
                },
                {
                  type: 'object',
                  properties: {
                    cron: {
                      type: 'string',
                    },
                  },
                  required: ['cron'],
                  additionalProperties: false,
                },
              ],
            },
          },
          required: ['db', 'timer'],
          additionalProperties: false,
        },
      } as McpTool

      const result = pipedreamComponentToTriggerDefinition(exampleTrigger)
      expect(result).toStrictEqual(expectedResult)
    })

    it('should handle empty configurable_props', () => {
      const emptyTrigger: PipedreamComponent<PipedreamComponentType.Trigger> = {
        ...exampleTrigger,
        configurable_props: [],
      }

      const expectedResult: McpTool = {
        name: 'notion-updated-page',
        description:
          'Emit new event when a page is created or updated in the selected database. [See the documentation](https://developers.notion.com/reference/page)',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
      }

      const result = pipedreamComponentToTriggerDefinition(emptyTrigger)
      expect(result).toStrictEqual(expectedResult)
    })
  })
})
