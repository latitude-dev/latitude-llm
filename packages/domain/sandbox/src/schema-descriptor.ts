import { z } from "zod"

/**
 * Serializable schema contract between sandboxed scripts and the host.
 *
 * The `z` global inside the sandbox is host-controlled: its builders produce
 * plain descriptor objects (this shape) rather than real Zod schemas, because
 * schemas only exist to cross the sandbox boundary — into `llm()` structured
 * generation and `parse()` validation, both performed by the host. The host
 * reconstructs a real Zod schema from the descriptor with
 * {@link buildSchemaFromDescriptor}.
 */
export interface BaseSchemaDescriptor {
  readonly optional?: boolean
  readonly nullable?: boolean
  readonly description?: string
}

export type SchemaDescriptor =
  | (BaseSchemaDescriptor & { readonly kind: "string"; readonly minLength?: number; readonly maxLength?: number })
  | (BaseSchemaDescriptor & {
      readonly kind: "number"
      readonly int?: boolean
      readonly min?: number
      readonly max?: number
    })
  | (BaseSchemaDescriptor & { readonly kind: "boolean" })
  | (BaseSchemaDescriptor & { readonly kind: "literal"; readonly value: string | number | boolean })
  | (BaseSchemaDescriptor & { readonly kind: "enum"; readonly values: readonly string[] })
  | (BaseSchemaDescriptor & { readonly kind: "array"; readonly element: SchemaDescriptor })
  | (BaseSchemaDescriptor & { readonly kind: "object"; readonly shape: Readonly<Record<string, SchemaDescriptor>> })
  | (BaseSchemaDescriptor & { readonly kind: "union"; readonly options: readonly SchemaDescriptor[] })

const baseDescriptorShape = {
  optional: z.boolean().optional(),
  nullable: z.boolean().optional(),
  description: z.string().optional(),
}

export const schemaDescriptorSchema: z.ZodType<SchemaDescriptor> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({
      ...baseDescriptorShape,
      kind: z.literal("string"),
      minLength: z.number().int().nonnegative().optional(),
      maxLength: z.number().int().nonnegative().optional(),
    }),
    z.object({
      ...baseDescriptorShape,
      kind: z.literal("number"),
      int: z.boolean().optional(),
      min: z.number().optional(),
      max: z.number().optional(),
    }),
    z.object({ ...baseDescriptorShape, kind: z.literal("boolean") }),
    z.object({
      ...baseDescriptorShape,
      kind: z.literal("literal"),
      value: z.union([z.string(), z.number(), z.boolean()]),
    }),
    z.object({ ...baseDescriptorShape, kind: z.literal("enum"), values: z.array(z.string()).min(1) }),
    z.object({ ...baseDescriptorShape, kind: z.literal("array"), element: schemaDescriptorSchema }),
    z.object({
      ...baseDescriptorShape,
      kind: z.literal("object"),
      shape: z.record(z.string(), schemaDescriptorSchema),
    }),
    z.object({
      ...baseDescriptorShape,
      kind: z.literal("union"),
      options: z.array(schemaDescriptorSchema).min(1),
    }),
  ]),
) as z.ZodType<SchemaDescriptor>

const buildCoreSchema = (descriptor: SchemaDescriptor): z.ZodType<unknown> => {
  switch (descriptor.kind) {
    case "string": {
      let schema = z.string()
      if (descriptor.minLength !== undefined) schema = schema.min(descriptor.minLength)
      if (descriptor.maxLength !== undefined) schema = schema.max(descriptor.maxLength)
      return schema
    }
    case "number": {
      let schema = descriptor.int ? z.number().int() : z.number()
      if (descriptor.min !== undefined) schema = schema.min(descriptor.min)
      if (descriptor.max !== undefined) schema = schema.max(descriptor.max)
      return schema
    }
    case "boolean":
      return z.boolean()
    case "literal":
      return z.literal(descriptor.value)
    case "enum":
      return z.enum([...descriptor.values] as [string, ...string[]])
    case "array":
      return z.array(buildSchemaFromDescriptor(descriptor.element))
    case "object": {
      const shape: Record<string, z.ZodType<unknown>> = {}
      for (const [key, value] of Object.entries(descriptor.shape)) {
        shape[key] = buildSchemaFromDescriptor(value)
      }
      return z.object(shape)
    }
    case "union": {
      const options = descriptor.options.map(buildSchemaFromDescriptor)
      if (options.length === 1) return options[0] as z.ZodType<unknown>
      return z.union(options as [z.ZodType<unknown>, z.ZodType<unknown>, ...z.ZodType<unknown>[]])
    }
  }
}

export const buildSchemaFromDescriptor = (descriptor: SchemaDescriptor): z.ZodType<unknown> => {
  let schema = buildCoreSchema(descriptor)
  if (descriptor.nullable) schema = schema.nullable()
  if (descriptor.optional) schema = schema.optional()
  if (descriptor.description !== undefined) schema = schema.describe(descriptor.description)
  return schema
}
