import { z } from 'zod'

const JSON_SCHEMA_TYPES = [
  'string',
  'number',
  'integer',
  'boolean',
  'object',
  'array',
  'null',
] as const

const JSON_ENUM_VALUES = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
])

export const zodJsonSchema: z.ZodType<unknown> = z.lazy(() =>
  z
    .object({
      // Meta‐Keywords
      $id: z.url().optional(),
      $schema: z.url().optional(),
      $ref: z.string().optional(),

      title: z.string().optional(),
      description: z.string().optional(),
      default: z.any().optional(),
      examples: z.array(z.any()).optional(),

      // Core Validation Keywords
      type: z
        .union([
          z.enum(JSON_SCHEMA_TYPES),
          z.array(z.enum(JSON_SCHEMA_TYPES)).min(1),
        ])
        .optional(),

      enum: z.array(JSON_ENUM_VALUES).optional(),
      const: JSON_ENUM_VALUES.optional(),

      // Numeric validation
      multipleOf: z.number().positive().optional(),
      maximum: z.number().optional(),
      exclusiveMaximum: z.number().optional(),
      minimum: z.number().optional(),
      exclusiveMinimum: z.number().optional(),

      // String validation
      maxLength: z.number().int().min(0).optional(),
      minLength: z.number().int().min(0).optional(),
      pattern: z.string().optional(),
      format: z.string().optional(),

      // Array validation
      maxItems: z.number().int().min(0).optional(),
      minItems: z.number().int().min(0).optional(),
      uniqueItems: z.boolean().optional(),

      items: z.union([zodJsonSchema, z.array(zodJsonSchema).min(1)]).optional(),
      additionalItems: z.union([z.boolean(), zodJsonSchema]).optional(),
      contains: zodJsonSchema.optional(),

      // Object validation
      maxProperties: z.number().int().min(0).optional(),
      minProperties: z.number().int().min(0).optional(),
      required: z.array(z.string()).optional(),
      properties: z.record(z.string(), zodJsonSchema).optional(),
      patternProperties: z.record(z.string(), zodJsonSchema).optional(),
      additionalProperties: z.union([z.boolean(), zodJsonSchema]).optional(),
      dependencies: z
        .record(
          z.string(),
          z.union([z.array(z.string()).min(1), zodJsonSchema]),
        )
        .optional(),
      propertyNames: zodJsonSchema.optional(),

      // Combining / Logic keywords
      allOf: z.array(zodJsonSchema).optional(),
      anyOf: z.array(zodJsonSchema).optional(),
      oneOf: z.array(zodJsonSchema).optional(),
      not: zodJsonSchema.optional(),

      //? Conditional (draft‐07+):
      // if: zodJsonSchema.optional(),
      // then: zodJsonSchema.optional(),
      // else: zodJsonSchema.optional(),

      // Annotations
      readOnly: z.boolean().optional(),
      writeOnly: z.boolean().optional(),
      deprecated: z.boolean().optional(),

      // Definitions / $defs
      definitions: z.record(z.string(), zodJsonSchema).optional(),
      $defs: z.record(z.string(), zodJsonSchema).optional(),
    })
    .superRefine((obj, ctx) => {
      // 1) items requires type: array
      if (obj.items !== undefined) {
        if (obj.type !== undefined) {
          const types = Array.isArray(obj.type) ? obj.type : [obj.type]
          if (!types.includes('array')) {
            ctx.addIssue({
              code: 'custom',
              message: "`items` is only allowed when `type` includes 'array'.",
              path: ['items'],
            })
          }
        }
      }

      // 2) object-only keywords require type: object
      const objectOnlyKeys = [
        'properties',
        'patternProperties',
        'required',
        'maxProperties',
        'minProperties',
        'additionalProperties',
        'dependencies',
        'propertyNames',
      ] as const

      for (const key of objectOnlyKeys) {
        if ((obj as any)[key] !== undefined) {
          if (obj.type !== undefined) {
            const types = Array.isArray(obj.type) ? obj.type : [obj.type]
            if (!types.includes('object')) {
              ctx.addIssue({
                code: 'custom',
                message: `\`${key}\` is only allowed when \`type\` includes 'object'.`,
                path: [key],
              })
            }
          }
        }
      }

      // 3) string-only keywords require type: string
      const stringOnlyKeys = [
        'pattern',
        'format',
        'minLength',
        'maxLength',
      ] as const
      for (const key of stringOnlyKeys) {
        if ((obj as any)[key] !== undefined) {
          if (obj.type !== undefined) {
            const types = Array.isArray(obj.type) ? obj.type : [obj.type]
            if (!types.includes('string')) {
              ctx.addIssue({
                code: 'custom',
                message: `\`${key}\` is only allowed when \`type\` includes 'string'.`,
                path: [key],
              })
            }
          }
        }
      }

      // 4) numeric-only keywords require type: number or integer
      const numericOnlyKeys = [
        'multipleOf',
        'minimum',
        'maximum',
        'exclusiveMinimum',
        'exclusiveMaximum',
      ] as const
      for (const key of numericOnlyKeys) {
        if ((obj as any)[key] !== undefined) {
          if (obj.type !== undefined) {
            const types = Array.isArray(obj.type) ? obj.type : [obj.type]
            if (!types.includes('number') && !types.includes('integer')) {
              ctx.addIssue({
                code: 'custom',
                message: `\`${key}\` is only allowed when \`type\` includes 'number' or 'integer'.`,
                path: [key],
              })
            }
          }
        }
      }
    }),
)
