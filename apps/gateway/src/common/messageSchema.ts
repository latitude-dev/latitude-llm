import { ContentType, MessageRole } from '@latitude-data/compiler'
import { z } from 'zod'

const userContentSchema = z.array(
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
      content: userContentSchema,
    }),
  )
  .or(
    z.object({
      role: z.literal(MessageRole.assistant),
      content: z.string().or(
        z.array(
          z.object({
            type: z.literal(ContentType.toolCall),
            toolCallId: z.string(),
            toolName: z.string(),
            args: z.record(z.any()),
          }),
        ),
      ),
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
      content: z.array(
        z.object({
          type: z.literal(ContentType.toolResult),
          toolCallId: z.string(),
          toolName: z.string(),
          result: z.string(),
          isError: z.boolean().optional(),
        }),
      ),
    }),
  )
