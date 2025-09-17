import { JSONSchema7 } from 'json-schema'
import {
  ConfigurableProp,
  ConfigurablePropInteger,
  ConfigurablePropString,
} from '@pipedream/sdk'
import { getPropOptions } from '../../../../helpers'

function propToJSONSchema(prop: ConfigurableProp): JSONSchema7 | undefined {
  const base: Partial<JSONSchema7> = {
    title: prop.name,
    description: prop.description,
    ...('default' in prop
      ? { default: (prop as ConfigurablePropString).default }
      : {}),
  }

  const options = getPropOptions(prop)

  switch (prop.type) {
    case 'boolean':
      return { ...base, type: 'boolean' }

    case 'integer':
      return {
        ...base,
        type: 'integer',
        minimum: (prop as ConfigurablePropInteger).min,
        maximum: (prop as ConfigurablePropInteger).max,
      }

    case 'integer[]':
      return {
        ...base,
        type: 'array',
        items: {
          type: 'integer',
          minimum: (prop as ConfigurablePropInteger).min,
          maximum: (prop as ConfigurablePropInteger).max,
        },
      }

    case 'string':
    case 'sql': // treat as string
    case '$.airtable.baseId':
    case '$.airtable.tableId':
    case '$.airtable.viewId':
    case '$.airtable.fieldId':
    case '$.discord.channel':
      return {
        ...base,
        type: 'string',
        ...(options ? { enum: Object.values(options) } : {}),
      }

    case 'string[]':
    case '$.discord.channel[]':
      return {
        ...base,
        type: 'array',
        items: {
          type: 'string',
          ...(options ? { enum: Object.values(options) } : {}),
        },
      }

    case 'object':
    case '$.service.db':
    case '$.interface.http':
    case '$.interface.apphook':
      // No structural definition is provided; expose generic object
      return {
        ...base,
        type: 'object',
        additionalProperties: true,
      }

    case '$.interface.timer': {
      // Two allowed shapes: { intervalSeconds: number } or { cron: string }
      const intervalSchema: JSONSchema7 = {
        type: 'object',
        properties: {
          intervalSeconds: { type: 'integer', minimum: 1 },
        },
        required: ['intervalSeconds'],
        additionalProperties: false,
      }

      const cronSchema: JSONSchema7 = {
        type: 'object',
        properties: {
          cron: { type: 'string' },
        },
        required: ['cron'],
        additionalProperties: false,
      }

      return {
        ...base,
        oneOf: [intervalSchema, cronSchema],
      }
    }

    default:
      // Fallback: return nothing
      return undefined
  }
}

function propsToJSONSchema(props: readonly ConfigurableProp[]) {
  const properties: Record<string, JSONSchema7> = {}
  const required: string[] = []

  for (const p of props) {
    const schema = propToJSONSchema(p)
    if (!schema) continue // Skip unsupported types

    properties[p.name] = schema
    if (!p.optional) required.push(p.name)
  }

  return {
    type: 'object' as const,
    properties,
    ...(required.length ? { required } : {}),
    additionalProperties: props.some((p) => p.reloadProps),
  }
}

export default propsToJSONSchema
