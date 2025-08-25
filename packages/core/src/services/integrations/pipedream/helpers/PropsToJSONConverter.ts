import type { JSONSchema7 } from 'json-schema'
import type { ConfigurableProp } from '@pipedream/sdk'

const getOptions = <T>(prop: ConfigurableProp): T[] | undefined => {
  if (!('options' in prop) || !prop.options) return

  // If options are label/value objects, take .value
  if (typeof prop.options[0] === 'object' && 'value' in prop.options[0]) {
    return (prop.options as Array<{ label: string; value: T }>).map((o) => o.value)
  }
  return prop.options as T[]
}

function propToJSONSchema(prop: ConfigurableProp): JSONSchema7 | undefined {
  const base: Partial<JSONSchema7> = {
    title: prop.name,
    description: prop.description,
    ...('default' in prop ? { default: prop.default } : {}),
  }

  switch (prop.type) {
    case 'boolean':
      return { ...base, type: 'boolean' }

    case 'integer':
      return {
        ...base,
        type: 'integer',
        minimum: prop.min,
        maximum: prop.max,
      }

    case 'integer[]':
      return {
        ...base,
        type: 'array',
        items: {
          type: 'integer',
          minimum: prop.min,
          maximum: prop.max,
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
        enum: getOptions<string>(prop),
      }

    case 'string[]':
    case '$.discord.channel[]':
      return {
        ...base,
        type: 'array',
        items: {
          type: 'string',
          enum: getOptions<string>(prop),
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

      if (prop.static) {
        // Fixed value
        return { ...base, const: prop.static }
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
