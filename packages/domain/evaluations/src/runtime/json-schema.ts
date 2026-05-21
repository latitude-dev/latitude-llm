import { z } from "zod"
import { EvaluationExecutionError } from "../errors.ts"

const JSON_SCHEMA_TYPES = ["object", "array", "string", "number", "integer", "boolean", "null"] as const
export const jsonSchemaTypeSchema = z.enum(JSON_SCHEMA_TYPES)
export type JsonSchemaType = z.infer<typeof jsonSchemaTypeSchema>

export type EvaluationJsonSchema =
  | {
      readonly type: "object"
      readonly properties?: Readonly<Record<string, EvaluationJsonSchema>>
      readonly required?: readonly string[]
      readonly additionalProperties?: boolean | EvaluationJsonSchema
      readonly description?: string
    }
  | {
      readonly type: "array"
      readonly items?: EvaluationJsonSchema
      readonly description?: string
    }
  | {
      readonly type: "string"
      readonly enum?: readonly string[]
      readonly const?: string
      readonly minLength?: number
      readonly maxLength?: number
      readonly description?: string
    }
  | {
      readonly type: "number" | "integer"
      readonly enum?: readonly number[]
      readonly const?: number
      readonly minimum?: number
      readonly maximum?: number
      readonly description?: string
    }
  | {
      readonly type: "boolean"
      readonly enum?: readonly boolean[]
      readonly const?: boolean
      readonly description?: string
    }
  | {
      readonly type: "null"
      readonly const?: null
      readonly description?: string
    }

const baseSchema = z.object({
  description: z.string().optional(),
})

type JsonSchemaParseContext = {
  readonly path: string
  readonly depth: number
}

const MAX_SCHEMA_DEPTH = 16
const unsupportedKeywords = new Set([
  "$ref",
  "$defs",
  "allOf",
  "anyOf",
  "oneOf",
  "not",
  "if",
  "then",
  "else",
  "format",
  "pattern",
  "patternProperties",
  "dependencies",
  "dependentSchemas",
  "dependentRequired",
])

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null

const assertSupportedKeywords = (schema: Record<string, unknown>, path: string) => {
  for (const key of Object.keys(schema)) {
    if (unsupportedKeywords.has(key)) {
      throw new EvaluationExecutionError({ message: `Unsupported JSON Schema keyword at ${path}: ${key}` })
    }
  }
}

const parseChildSchema = (value: unknown, context: JsonSchemaParseContext): EvaluationJsonSchema =>
  evaluationJsonSchemaSchema.parse(value, context)

export const evaluationJsonSchemaSchema = {
  parse(value: unknown, context: JsonSchemaParseContext = { path: "$", depth: 0 }): EvaluationJsonSchema {
    if (!isRecord(value)) {
      throw new EvaluationExecutionError({ message: `JSON Schema at ${context.path} must be an object` })
    }
    if (context.depth > MAX_SCHEMA_DEPTH) {
      throw new EvaluationExecutionError({ message: `JSON Schema at ${context.path} exceeds maximum depth` })
    }

    assertSupportedKeywords(value, context.path)
    const type = jsonSchemaTypeSchema.parse(value.type)
    const common = baseSchema.parse(value)

    switch (type) {
      case "object": {
        const properties = value.properties
        if (properties !== undefined && !isRecord(properties)) {
          throw new EvaluationExecutionError({ message: `JSON Schema properties at ${context.path} must be an object` })
        }

        const parsedProperties: Record<string, EvaluationJsonSchema> = {}
        for (const [key, child] of Object.entries(properties ?? {})) {
          parsedProperties[key] = parseChildSchema(child, {
            path: `${context.path}.properties.${key}`,
            depth: context.depth + 1,
          })
        }

        const required = z.array(z.string()).optional().parse(value.required)
        const additionalProperties = value.additionalProperties
        let parsedAdditionalProperties: boolean | EvaluationJsonSchema | undefined
        if (additionalProperties !== undefined) {
          if (typeof additionalProperties === "boolean") {
            parsedAdditionalProperties = additionalProperties
          } else {
            parsedAdditionalProperties = parseChildSchema(additionalProperties, {
              path: `${context.path}.additionalProperties`,
              depth: context.depth + 1,
            })
          }
        }

        return {
          type,
          ...(Object.keys(parsedProperties).length > 0 ? { properties: parsedProperties } : {}),
          ...(required !== undefined ? { required } : {}),
          ...(parsedAdditionalProperties !== undefined ? { additionalProperties: parsedAdditionalProperties } : {}),
          ...(common.description !== undefined ? { description: common.description } : {}),
        }
      }
      case "array": {
        return {
          type,
          ...(value.items !== undefined
            ? { items: parseChildSchema(value.items, { path: `${context.path}.items`, depth: context.depth + 1 }) }
            : {}),
          ...(common.description !== undefined ? { description: common.description } : {}),
        }
      }
      case "string": {
        return {
          type,
          ...(value.enum !== undefined ? { enum: z.array(z.string()).parse(value.enum) } : {}),
          ...(value.const !== undefined ? { const: z.string().parse(value.const) } : {}),
          ...(value.minLength !== undefined
            ? { minLength: z.number().int().nonnegative().parse(value.minLength) }
            : {}),
          ...(value.maxLength !== undefined
            ? { maxLength: z.number().int().nonnegative().parse(value.maxLength) }
            : {}),
          ...(common.description !== undefined ? { description: common.description } : {}),
        }
      }
      case "number":
      case "integer": {
        return {
          type,
          ...(value.enum !== undefined ? { enum: z.array(z.number()).parse(value.enum) } : {}),
          ...(value.const !== undefined ? { const: z.number().parse(value.const) } : {}),
          ...(value.minimum !== undefined ? { minimum: z.number().parse(value.minimum) } : {}),
          ...(value.maximum !== undefined ? { maximum: z.number().parse(value.maximum) } : {}),
          ...(common.description !== undefined ? { description: common.description } : {}),
        }
      }
      case "boolean": {
        return {
          type,
          ...(value.enum !== undefined ? { enum: z.array(z.boolean()).parse(value.enum) } : {}),
          ...(value.const !== undefined ? { const: z.boolean().parse(value.const) } : {}),
          ...(common.description !== undefined ? { description: common.description } : {}),
        }
      }
      case "null": {
        return {
          type,
          ...(value.const !== undefined ? { const: z.null().parse(value.const) } : {}),
          ...(common.description !== undefined ? { description: common.description } : {}),
        }
      }
    }
  },
}

const withDescription = <T extends z.ZodType>(schema: T, description: string | undefined): T =>
  description ? (schema.describe(description) as T) : schema

const stringEnumToZod = (values: readonly string[]): z.ZodType => {
  if (values.length === 0) return z.never()
  const [first, ...rest] = values
  let schema: z.ZodType = z.literal(first)
  for (const value of rest) {
    schema = z.union([schema, z.literal(value)])
  }
  return schema
}

const numericEnumToZod = (values: readonly number[]): z.ZodType => {
  if (values.length === 0) return z.never()
  const [first, ...rest] = values
  let schema: z.ZodType = z.literal(first)
  for (const value of rest) {
    schema = z.union([schema, z.literal(value)])
  }
  return schema
}

export const jsonSchemaToZod = (schema: EvaluationJsonSchema): z.ZodType => {
  switch (schema.type) {
    case "object": {
      const shape: Record<string, z.ZodType> = {}
      const required = new Set(schema.required ?? [])
      for (const [key, child] of Object.entries(schema.properties ?? {})) {
        const childSchema = jsonSchemaToZod(child)
        shape[key] = required.has(key) ? childSchema : childSchema.optional()
      }
      let objectSchema = z.object(shape)
      if (schema.additionalProperties === false) objectSchema = objectSchema.strict()
      return withDescription(objectSchema, schema.description)
    }
    case "array":
      return withDescription(z.array(schema.items ? jsonSchemaToZod(schema.items) : z.unknown()), schema.description)
    case "string": {
      let stringSchema = z.string()
      if (schema.minLength !== undefined) stringSchema = stringSchema.min(schema.minLength)
      if (schema.maxLength !== undefined) stringSchema = stringSchema.max(schema.maxLength)
      const base =
        schema.const !== undefined ? z.literal(schema.const) : schema.enum ? stringEnumToZod(schema.enum) : stringSchema
      return withDescription(base, schema.description)
    }
    case "number": {
      let numberSchema = z.number()
      if (schema.minimum !== undefined) numberSchema = numberSchema.min(schema.minimum)
      if (schema.maximum !== undefined) numberSchema = numberSchema.max(schema.maximum)
      const base =
        schema.const !== undefined
          ? z.literal(schema.const)
          : schema.enum
            ? numericEnumToZod(schema.enum)
            : numberSchema
      return withDescription(base, schema.description)
    }
    case "integer": {
      let numberSchema = z.number().int()
      if (schema.minimum !== undefined) numberSchema = numberSchema.min(schema.minimum)
      if (schema.maximum !== undefined) numberSchema = numberSchema.max(schema.maximum)
      const base =
        schema.const !== undefined
          ? z.literal(schema.const)
          : schema.enum
            ? numericEnumToZod(schema.enum)
            : numberSchema
      return withDescription(base, schema.description)
    }
    case "boolean": {
      const base = schema.const !== undefined ? z.literal(schema.const) : z.boolean()
      return withDescription(base, schema.description)
    }
    case "null":
      return withDescription(z.null(), schema.description)
  }
}

export const evaluationVerdictJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["passed", "feedback"],
  properties: {
    passed: { type: "boolean" },
    feedback: { type: "string", minLength: 1 },
  },
} as const satisfies EvaluationJsonSchema
