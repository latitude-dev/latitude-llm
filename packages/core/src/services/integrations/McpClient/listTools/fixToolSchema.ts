import { JSONSchema7 } from 'json-schema'

export function fixToolSchema(schema: JSONSchema7): JSONSchema7 {
  if (schema.type === 'object') {
    if (schema.properties) {
      Object.entries(schema.properties).forEach(([key, value]) => {
        schema.properties![key] = fixToolSchema(value as JSONSchema7)
      })
    } else {
      schema.properties = {}
    }
  }

  if (schema.type === 'array') {
    if (schema.items) {
      if (Array.isArray(schema.items)) {
        schema.items = schema.items.map((item) =>
          fixToolSchema(item as JSONSchema7),
        )
      } else {
        schema.items = fixToolSchema(schema.items as JSONSchema7)
      }
    } else {
      // Required by OpenAI
      schema.items = {} // "any" type
    }
  }

  return schema
}
