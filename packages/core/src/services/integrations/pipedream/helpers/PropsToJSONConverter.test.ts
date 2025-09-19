import { describe, expect, it } from 'vitest'
import { ConfigurableProp } from '@pipedream/sdk'
import propsToJSONSchema from './PropsToJSONConverter'

describe('propsToJSONSchema', () => {
  describe('basic prop types', () => {
    it('should convert boolean prop', () => {
      const props: ConfigurableProp[] = [
        {
          name: 'enabled',
          type: 'boolean',
          description: 'Enable feature',
        },
      ]

      const result = propsToJSONSchema(props)

      expect(result).toEqual({
        type: 'object',
        properties: {
          enabled: {
            title: 'enabled',
            description: 'Enable feature',
            type: 'boolean',
          },
        },
        required: ['enabled'],
        additionalProperties: false,
      })
    })

    it('should convert string prop', () => {
      const props: ConfigurableProp[] = [
        {
          name: 'message',
          type: 'string',
          description: 'Message to send',
        },
      ]

      const result = propsToJSONSchema(props)

      expect(result).toEqual({
        type: 'object',
        properties: {
          message: {
            title: 'message',
            description: 'Message to send',
            type: 'string',
          },
        },
        required: ['message'],
        additionalProperties: false,
      })
    })

    it('should convert integer prop with min/max', () => {
      const props = [
        {
          name: 'count',
          type: 'integer',
          description: 'Number of items',
          min: 1,
          max: 100,
        } as ConfigurableProp,
      ]

      const result = propsToJSONSchema(props)

      expect(result).toEqual({
        type: 'object',
        properties: {
          count: {
            title: 'count',
            description: 'Number of items',
            type: 'integer',
            minimum: 1,
            maximum: 100,
          },
        },
        required: ['count'],
        additionalProperties: false,
      })
    })

    it('should convert integer prop without min/max', () => {
      const props: ConfigurableProp[] = [
        {
          name: 'count',
          type: 'integer',
          description: 'Number of items',
        },
      ]

      const result = propsToJSONSchema(props)

      expect(result).toEqual({
        type: 'object',
        properties: {
          count: {
            title: 'count',
            description: 'Number of items',
            type: 'integer',
          },
        },
        required: ['count'],
        additionalProperties: false,
      })
    })

    it('should convert object prop', () => {
      const props: ConfigurableProp[] = [
        {
          name: 'config',
          type: 'object',
          description: 'Configuration object',
        },
      ]

      const result = propsToJSONSchema(props)

      expect(result).toEqual({
        type: 'object',
        properties: {
          config: {
            title: 'config',
            description: 'Configuration object',
            type: 'object',
            additionalProperties: true,
          },
        },
        required: ['config'],
        additionalProperties: false,
      })
    })
  })

  describe('array types', () => {
    it('should convert integer array prop', () => {
      const props = [
        {
          name: 'numbers',
          type: 'integer[]',
          description: 'Array of numbers',
          min: 0,
          max: 10,
        } as ConfigurableProp,
      ]

      const result = propsToJSONSchema(props)

      expect(result).toEqual({
        type: 'object',
        properties: {
          numbers: {
            title: 'numbers',
            description: 'Array of numbers',
            type: 'array',
            items: {
              type: 'integer',
              minimum: 0,
              maximum: 10,
            },
          },
        },
        required: ['numbers'],
        additionalProperties: false,
      })
    })

    it('should convert string array prop', () => {
      const props: ConfigurableProp[] = [
        {
          name: 'tags',
          type: 'string[]',
          description: 'Array of tags',
        },
      ]

      const result = propsToJSONSchema(props)

      expect(result).toEqual({
        type: 'object',
        properties: {
          tags: {
            title: 'tags',
            description: 'Array of tags',
            type: 'array',
            items: {
              type: 'string',
            },
          },
        },
        required: ['tags'],
        additionalProperties: false,
      })
    })
  })

  describe('special types', () => {
    it('should convert SQL type as string', () => {
      const props: ConfigurableProp[] = [
        {
          name: 'query',
          type: 'sql',
          description: 'SQL query',
        },
      ]

      const result = propsToJSONSchema(props)

      expect(result).toEqual({
        type: 'object',
        properties: {
          query: {
            title: 'query',
            description: 'SQL query',
            type: 'string',
          },
        },
        required: ['query'],
        additionalProperties: false,
      })
    })

    it('should convert Airtable base ID type as string', () => {
      const props: ConfigurableProp[] = [
        {
          name: 'baseId',
          type: '$.airtable.baseId',
          description: 'Airtable base ID',
        },
      ]

      const result = propsToJSONSchema(props)

      expect(result).toEqual({
        type: 'object',
        properties: {
          baseId: {
            title: 'baseId',
            description: 'Airtable base ID',
            type: 'string',
          },
        },
        required: ['baseId'],
        additionalProperties: false,
      })
    })

    it('should convert Discord channel type as string', () => {
      const props: ConfigurableProp[] = [
        {
          name: 'channel',
          type: '$.discord.channel',
          description: 'Discord channel',
        },
      ]

      const result = propsToJSONSchema(props)

      expect(result).toEqual({
        type: 'object',
        properties: {
          channel: {
            title: 'channel',
            description: 'Discord channel',
            type: 'string',
          },
        },
        required: ['channel'],
        additionalProperties: false,
      })
    })

    it('should convert Discord channel array type as string array', () => {
      const props: ConfigurableProp[] = [
        {
          name: 'channels',
          type: '$.discord.channel[]',
          description: 'Discord channels',
        },
      ]

      const result = propsToJSONSchema(props)

      expect(result).toEqual({
        type: 'object',
        properties: {
          channels: {
            title: 'channels',
            description: 'Discord channels',
            type: 'array',
            items: {
              type: 'string',
            },
          },
        },
        required: ['channels'],
        additionalProperties: false,
      })
    })

    it('should convert service database type as object', () => {
      const props: ConfigurableProp[] = [
        {
          name: 'database',
          type: '$.service.db',
          description: 'Database connection',
        },
      ]

      const result = propsToJSONSchema(props)

      expect(result).toEqual({
        type: 'object',
        properties: {
          database: {
            title: 'database',
            description: 'Database connection',
            type: 'object',
            additionalProperties: true,
          },
        },
        required: ['database'],
        additionalProperties: false,
      })
    })

    it('should convert interface types as objects', () => {
      const props: ConfigurableProp[] = [
        {
          name: 'http',
          type: '$.interface.http',
          description: 'HTTP interface',
        },
        {
          name: 'apphook',
          type: '$.interface.apphook',
          description: 'App hook interface',
        },
      ]

      const result = propsToJSONSchema(props)

      expect(result).toEqual({
        type: 'object',
        properties: {
          http: {
            title: 'http',
            description: 'HTTP interface',
            type: 'object',
            additionalProperties: true,
          },
          apphook: {
            title: 'apphook',
            description: 'App hook interface',
            type: 'object',
            additionalProperties: true,
          },
        },
        required: ['http', 'apphook'],
        additionalProperties: false,
      })
    })
  })

  describe('timer interface type', () => {
    it('should convert timer interface without', () => {
      const props = [
        {
          name: 'timer',
          type: '$.interface.timer',
          description: 'Timer configuration',
        } as ConfigurableProp,
      ]

      const result = propsToJSONSchema(props)

      expect(result).toEqual({
        type: 'object',
        properties: {
          timer: {
            title: 'timer',
            description: 'Timer configuration',
            oneOf: [
              {
                type: 'object',
                properties: {
                  intervalSeconds: { type: 'integer', minimum: 1 },
                },
                required: ['intervalSeconds'],
                additionalProperties: false,
              },
              {
                type: 'object',
                properties: {
                  cron: { type: 'string' },
                },
                required: ['cron'],
                additionalProperties: false,
              },
            ],
          },
        },
        required: ['timer'],
        additionalProperties: false,
      })
    })
  })

  describe('props with options', () => {
    it('should handle string options as simple values', () => {
      const props = [
        {
          name: 'size',
          type: 'string',
          description: 'Size option',
          options: ['small', 'medium', 'large'],
        } as ConfigurableProp,
      ]

      const result = propsToJSONSchema(props)

      expect(result).toEqual({
        type: 'object',
        properties: {
          size: {
            title: 'size',
            description: 'Size option',
            type: 'string',
            enum: ['small', 'medium', 'large'],
          },
        },
        required: ['size'],
        additionalProperties: false,
      })
    })

    it('should handle options as label-value objects', () => {
      const props = [
        {
          name: 'priority',
          type: 'string',
          description: 'Priority level',
          options: [
            { label: 'Low Priority', value: 'low' },
            { label: 'High Priority', value: 'high' },
          ],
        } as ConfigurableProp,
      ]

      const result = propsToJSONSchema(props)

      expect(result).toEqual({
        type: 'object',
        properties: {
          priority: {
            title: 'priority',
            description: 'Priority level',
            type: 'string',
            enum: ['low', 'high'],
          },
        },
        required: ['priority'],
        additionalProperties: false,
      })
    })

    it('should handle options for array types', () => {
      const props = [
        {
          name: 'tags',
          type: 'string[]',
          description: 'Selected tags',
          options: ['tag1', 'tag2', 'tag3'],
        } as ConfigurableProp,
      ]

      const result = propsToJSONSchema(props)

      expect(result).toEqual({
        type: 'object',
        properties: {
          tags: {
            title: 'tags',
            description: 'Selected tags',
            type: 'array',
            items: {
              type: 'string',
              enum: ['tag1', 'tag2', 'tag3'],
            },
          },
        },
        required: ['tags'],
        additionalProperties: false,
      })
    })

    it('should handle empty options array', () => {
      const props = [
        {
          name: 'category',
          type: 'string',
          description: 'Category',
          options: [],
        } as ConfigurableProp,
      ]

      const result = propsToJSONSchema(props)

      expect(result).toEqual({
        type: 'object',
        properties: {
          category: {
            title: 'category',
            description: 'Category',
            type: 'string',
            enum: [],
          },
        },
        required: ['category'],
        additionalProperties: false,
      })
    })
  })

  describe('default values', () => {
    it('should include default value for string', () => {
      const props = [
        {
          name: 'message',
          type: 'string',
          description: 'Message',
          default: 'Hello World',
        } as ConfigurableProp,
      ]

      const result = propsToJSONSchema(props)

      expect(result.properties.message).toEqual({
        title: 'message',
        description: 'Message',
        type: 'string',

        default: 'Hello World',
      })
    })

    it('should include default value for number', () => {
      const props = [
        {
          name: 'count',
          type: 'integer',
          description: 'Count',
          default: 42,
        } as ConfigurableProp,
      ]

      const result = propsToJSONSchema(props)

      expect(result.properties.count).toEqual({
        title: 'count',
        description: 'Count',
        type: 'integer',
        default: 42,
      })
    })

    it('should include default value for boolean', () => {
      const props = [
        {
          name: 'enabled',
          type: 'boolean',
          description: 'Enabled',
          default: true,
        } as ConfigurableProp,
      ]

      const result = propsToJSONSchema(props)

      expect(result.properties.enabled).toEqual({
        title: 'enabled',
        description: 'Enabled',
        type: 'boolean',
        default: true,
      })
    })

    it('should include default value for array', () => {
      const props = [
        {
          name: 'tags',
          type: 'string[]',
          description: 'Tags',
          default: ['tag1', 'tag2'],
        } as ConfigurableProp,
      ]

      const result = propsToJSONSchema(props)

      expect(result.properties.tags).toEqual({
        title: 'tags',
        description: 'Tags',
        type: 'array',
        items: {
          type: 'string',
        },
        default: ['tag1', 'tag2'],
      })
    })

    it('should include default value for object', () => {
      const props = [
        {
          name: 'config',
          type: 'object',
          description: 'Configuration',
          default: { key: 'value' },
        } as ConfigurableProp,
      ]

      const result = propsToJSONSchema(props)

      expect(result.properties.config).toEqual({
        title: 'config',
        description: 'Configuration',
        type: 'object',
        additionalProperties: true,
        default: { key: 'value' },
      })
    })

    it('should handle null default value', () => {
      const props = [
        {
          name: 'optional',
          type: 'string',
          description: 'Optional value',
          default: null,
        } as ConfigurableProp,
      ]

      const result = propsToJSONSchema(props)

      expect(result.properties.optional).toEqual({
        title: 'optional',
        description: 'Optional value',
        type: 'string',

        default: null,
      })
    })

    it('should not include default for undefined values', () => {
      const props = [
        {
          name: 'message',
          type: 'string',
          description: 'Message',
          default: undefined,
        } as ConfigurableProp,
      ]

      const result = propsToJSONSchema(props)

      expect(result.properties.message).toEqual({
        title: 'message',
        description: 'Message',
        type: 'string',

        default: undefined,
      })
    })

    it('should filter out unsupported default value types', () => {
      const props = [
        {
          name: 'func',
          type: 'string',
          description: 'Function value',
          default: () => 'test', // function is not supported
        } as ConfigurableProp,
      ]

      const result = propsToJSONSchema(props)

      expect(result.properties.func).toEqual({
        title: 'func',
        description: 'Function value',
        type: 'string',

        default: expect.any(Function),
      })
    })
  })

  describe('optional props', () => {
    it('should mark optional props as not required', () => {
      const props = [
        {
          name: 'required',
          type: 'string',
          description: 'Required field',
        } as ConfigurableProp,
        {
          name: 'optional',
          type: 'string',
          description: 'Optional field',
          optional: true,
        } as ConfigurableProp,
      ]

      const result = propsToJSONSchema(props)

      expect(result.required).toEqual(['required'])
    })

    it('should handle all optional props', () => {
      const props = [
        {
          name: 'optional1',
          type: 'string',
          description: 'Optional field 1',
          optional: true,
        } as ConfigurableProp,
        {
          name: 'optional2',
          type: 'boolean',
          description: 'Optional field 2',
          optional: true,
        } as ConfigurableProp,
      ]

      const result = propsToJSONSchema(props)

      expect(result).not.toHaveProperty('required')
    })
  })

  describe('reloadProps handling', () => {
    it('should set additionalProperties to true when any prop has reloadProps', () => {
      const props = [
        {
          name: 'normal',
          type: 'string',
          description: 'Normal field',
        } as ConfigurableProp,
        {
          name: 'dynamic',
          type: 'string',
          description: 'Dynamic field',
          reloadProps: true,
        } as ConfigurableProp,
      ]

      const result = propsToJSONSchema(props)

      expect(result.additionalProperties).toBe(true)
    })

    it('should set additionalProperties to false when no props have reloadProps', () => {
      const props = [
        {
          name: 'field1',
          type: 'string',
          description: 'Field 1',
        } as ConfigurableProp,
        {
          name: 'field2',
          type: 'boolean',
          description: 'Field 2',
        } as ConfigurableProp,
      ]

      const result = propsToJSONSchema(props)

      expect(result.additionalProperties).toBe(false)
    })
  })

  describe('unsupported types', () => {
    it('should skip unsupported prop types', () => {
      const props = [
        {
          name: 'supported',
          type: 'string',
          description: 'Supported field',
        } as ConfigurableProp,
        {
          name: 'unsupported',
          type: 'unknown-type' as any,
          description: 'Unsupported field',
        } as ConfigurableProp,
      ]

      const result = propsToJSONSchema(props)

      expect(result).toEqual({
        type: 'object',
        properties: {
          supported: {
            title: 'supported',
            description: 'Supported field',
            type: 'string',
          },
        },
        required: ['supported'],
        additionalProperties: false,
      })
    })
  })

  describe('edge cases', () => {
    it('should handle empty props array', () => {
      const props: ConfigurableProp[] = []

      const result = propsToJSONSchema(props)

      expect(result).toEqual({
        type: 'object',
        properties: {},
        additionalProperties: false,
      })
    })

    it('should handle props with no name or description', () => {
      const props: ConfigurableProp[] = [
        {
          name: '',
          type: 'string',
        } as ConfigurableProp,
      ]

      const result = propsToJSONSchema(props)

      expect(result).toEqual({
        type: 'object',
        properties: {
          '': {
            title: '',
            description: undefined,
            type: 'string',
          },
        },
        required: [''],
        additionalProperties: false,
      })
    })

    it('should handle complex mixed scenario', () => {
      const props = [
        {
          name: 'message',
          type: 'string',
          description: 'Message to send',
          default: 'Hello',
          options: ['Hello', 'Hi', 'Hey'],
        } as ConfigurableProp,
        {
          name: 'count',
          type: 'integer',
          description: 'Number of messages',
          min: 1,
          max: 10,
          optional: true,
        } as ConfigurableProp,
        {
          name: 'enabled',
          type: 'boolean',
          description: 'Enable feature',
          default: false,
        } as ConfigurableProp,
        {
          name: 'tags',
          type: 'string[]',
          description: 'Message tags',
          options: [
            { label: 'Important', value: 'important' },
            { label: 'Urgent', value: 'urgent' },
          ],
          optional: true,
        } as ConfigurableProp,
        {
          name: 'timer',
          type: '$.interface.timer',
          description: 'Schedule',
          reloadProps: true,
        } as ConfigurableProp,
        {
          name: 'unsupported',
          type: 'invalid-type' as any,
          description: 'This should be skipped',
        } as ConfigurableProp,
      ]

      const result = propsToJSONSchema(props)

      expect(result).toEqual({
        type: 'object',
        properties: {
          message: {
            title: 'message',
            description: 'Message to send',
            type: 'string',
            enum: ['Hello', 'Hi', 'Hey'],
            default: 'Hello',
          },
          count: {
            title: 'count',
            description: 'Number of messages',
            type: 'integer',
            minimum: 1,
            maximum: 10,
          },
          enabled: {
            title: 'enabled',
            description: 'Enable feature',
            type: 'boolean',
            default: false,
          },
          tags: {
            title: 'tags',
            description: 'Message tags',
            type: 'array',
            items: {
              type: 'string',
              enum: ['important', 'urgent'],
            },
          },
          timer: {
            title: 'timer',
            description: 'Schedule',
            oneOf: [
              {
                type: 'object',
                properties: {
                  intervalSeconds: { type: 'integer', minimum: 1 },
                },
                required: ['intervalSeconds'],
                additionalProperties: false,
              },
              {
                type: 'object',
                properties: {
                  cron: { type: 'string' },
                },
                required: ['cron'],
                additionalProperties: false,
              },
            ],
          },
        },
        required: ['message', 'enabled', 'timer'],
        additionalProperties: true, // because timer has reloadProps: true
      })
    })
  })
})
