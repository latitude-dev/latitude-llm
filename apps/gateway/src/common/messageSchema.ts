import { ContentType, MessageRole } from '$compiler/types'
import { z } from 'zod'

const contentSchema = z.array(
  z
    .object({
      type: z.literal(ContentType.text),
      text: z.string(),
    })
    .or(
      z.object({
        type: z.literal(ContentType.image),
        image: z
          .string()
          .or(z.instanceof(Uint8Array))
          .or(z.instanceof(Buffer))
          .or(z.instanceof(ArrayBuffer))
          .or(z.instanceof(URL)),
      }),
    ),
)

// TODO: We could unify the way this schema is build.
// We could have this zod schema as base in a common package and
// infer compiler's types from it
export const messageSchema = z
  .object({
    role: z.literal(MessageRole.system),
    content: z.string(),
  })
  .or(
    z.object({
      role: z.literal(MessageRole.user),
      name: z.string().optional(),
      content: contentSchema,
    }),
  )
  .or(
    z.object({
      role: z.literal(MessageRole.assistant),
      content: z.string(),
      toolCalls: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          arguments: z.record(z.any()),
        }),
      ),
    }),
  )
  .or(
    z.object({
      role: z.literal(MessageRole.tool),
      content: contentSchema,
      id: z.string(),
    }),
  )
