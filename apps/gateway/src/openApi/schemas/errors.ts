import { z } from '@hono/zod-openapi'

const ChainErrorDetailSchema = z.object({
  entityUuid: z
    .string()
    .uuid()
    .openapi({ description: 'UUID of the related entity' }),
  entityType: z.string().openapi({ description: 'Type of the related entity' }),
})

const BaseErrorSchema = z.object({
  name: z.string().openapi({ description: 'The name of the error' }),
  errorCode: z.string().openapi({ description: 'The error code identifier' }),
  message: z.string().openapi({ description: 'Detailed error message' }),
  details: z.object({}).passthrough().optional().openapi({
    type: 'object',
    additionalProperties: true,
    description: 'Additional error details',
  }),
})

const HTTPExceptionErrorSchema = BaseErrorSchema.extend({
  details: z
    .object({
      cause: z
        .any()
        .optional()
        .openapi({ type: 'object', additionalProperties: true }),
    })
    .optional(),
}).openapi({
  description: 'Error response for HTTP exceptions',
  example: {
    name: 'HTTPException',
    errorCode: 'HTTPException',
    message: 'Not Found',
    details: { cause: 'Resource not found' },
  },
})

const UnprocessableEntityErrorSchema = BaseErrorSchema.extend({
  details: z
    .any()
    .optional()
    .openapi({ type: 'object', additionalProperties: true }),
})
  .and(z.object({ dbErrorRef: ChainErrorDetailSchema }).optional())
  .openapi({
    description: 'Error response for unprocessable entities',
    example: {
      name: 'DocumentRunError',
      errorCode: 'SomeErrorCode',
      message: 'Validation failed',
      details: {},
      dbErrorRef: {
        entityUuid: '123e4567-e89b-12d3-a456-426614174000',
        entityType: 'Document',
      },
    },
  })

const BadRequestErrorSchema = BaseErrorSchema.extend({
  details: z
    .any()
    .optional()
    .openapi({ type: 'object', additionalProperties: true }),
}).openapi({
  description: 'Error response for Latitude-specific errors',
  example: {
    name: 'LatitudeError',
    errorCode: 'LatitudeError',
    message: 'A latitude-specific error occurred',
    details: {},
  },
})

const InternalServerErrorSchema = BaseErrorSchema.extend({
  details: z
    .object({
      cause: z
        .any()
        .optional()
        .openapi({ type: 'object', additionalProperties: true }),
    })
    .optional(),
}).openapi({
  description: 'Error response for internal server errors',
  example: {
    name: 'InternalServerError',
    errorCode: 'InternalServerError',
    message: 'An unexpected error occurred',
    details: { cause: 'Null reference exception' },
  },
})

export {
  HTTPExceptionErrorSchema,
  UnprocessableEntityErrorSchema,
  BadRequestErrorSchema,
  InternalServerErrorSchema,
}
