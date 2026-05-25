import { z } from "zod"

const JSON_SCHEMA_TYPES = ["object", "array", "string", "number", "integer", "boolean", "null"] as const
export const jsonSchemaTypeSchema = z.enum(JSON_SCHEMA_TYPES)
export type JsonSchemaType = z.infer<typeof jsonSchemaTypeSchema>

export type EvaluationJsonSchema =
  | {
      readonly type: "object"
      readonly properties?: Readonly<Record<string, EvaluationJsonSchema>> | undefined
      readonly required?: readonly string[] | undefined
      readonly additionalProperties?: boolean | EvaluationJsonSchema | undefined
      readonly description?: string | undefined
    }
  | {
      readonly type: "array"
      readonly items?: EvaluationJsonSchema | undefined
      readonly description?: string | undefined
    }
  | {
      readonly type: "string"
      readonly enum?: readonly string[] | undefined
      readonly const?: string | undefined
      readonly minLength?: number | undefined
      readonly maxLength?: number | undefined
      readonly description?: string | undefined
    }
  | {
      readonly type: "number" | "integer"
      readonly enum?: readonly number[] | undefined
      readonly const?: number | undefined
      readonly minimum?: number | undefined
      readonly maximum?: number | undefined
      readonly description?: string | undefined
    }
  | {
      readonly type: "boolean"
      readonly enum?: readonly boolean[] | undefined
      readonly const?: boolean | undefined
      readonly description?: string | undefined
    }
  | {
      readonly type: "null"
      readonly const?: null | undefined
      readonly description?: string | undefined
    }

export const evaluationJsonSchemaSchema: z.ZodType<EvaluationJsonSchema> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z
      .object({
        type: z.literal("object"),
        properties: z.record(z.string(), evaluationJsonSchemaSchema).optional(),
        required: z.array(z.string()).optional(),
        additionalProperties: z.union([z.boolean(), evaluationJsonSchemaSchema]).optional(),
        description: z.string().optional(),
      })
      .strict(),
    z
      .object({
        type: z.literal("array"),
        items: evaluationJsonSchemaSchema.optional(),
        description: z.string().optional(),
      })
      .strict(),
    z
      .object({
        type: z.literal("string"),
        enum: z.array(z.string()).optional(),
        const: z.string().optional(),
        minLength: z.number().int().nonnegative().optional(),
        maxLength: z.number().int().nonnegative().optional(),
        description: z.string().optional(),
      })
      .strict(),
    z
      .object({
        type: z.literal("number"),
        enum: z.array(z.number()).optional(),
        const: z.number().optional(),
        minimum: z.number().optional(),
        maximum: z.number().optional(),
        description: z.string().optional(),
      })
      .strict(),
    z
      .object({
        type: z.literal("integer"),
        enum: z.array(z.number()).optional(),
        const: z.number().optional(),
        minimum: z.number().optional(),
        maximum: z.number().optional(),
        description: z.string().optional(),
      })
      .strict(),
    z
      .object({
        type: z.literal("boolean"),
        enum: z.array(z.boolean()).optional(),
        const: z.boolean().optional(),
        description: z.string().optional(),
      })
      .strict(),
    z
      .object({
        type: z.literal("null"),
        const: z.null().optional(),
        description: z.string().optional(),
      })
      .strict(),
  ]),
)

const withDescription = (schema: z.ZodType, description: string | undefined): z.ZodType =>
  description ? schema.describe(description) : schema

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

const booleanEnumToZod = (values: readonly boolean[]): z.ZodType => {
  if (values.length === 0) return z.never()
  const uniqueValues = [...new Set(values)]
  const [first, ...rest] = uniqueValues
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

      const objectSchema = z.object(shape)
      const base =
        schema.additionalProperties === false
          ? objectSchema.strict()
          : schema.additionalProperties === true
            ? objectSchema.catchall(z.unknown())
            : typeof schema.additionalProperties === "object"
              ? objectSchema.catchall(jsonSchemaToZod(schema.additionalProperties))
              : objectSchema

      return withDescription(base, schema.description)
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
      const base =
        schema.const !== undefined ? z.literal(schema.const) : schema.enum ? booleanEnumToZod(schema.enum) : z.boolean()
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
