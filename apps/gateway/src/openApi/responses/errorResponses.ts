import http from '$/common/http'
import {
  BadRequestErrorSchema,
  HTTPExceptionErrorSchema,
  InternalServerErrorSchema,
  UnprocessableEntityErrorSchema,
} from '$/openApi/schemas'

export const GENERIC_ERROR_RESPONSES = {
  [http.Status.NOT_FOUND]: {
    description: 'The requested resource was not found.',
    content: {
      [http.MediaTypes.JSON]: {
        schema: HTTPExceptionErrorSchema,
      },
    },
  },
  [http.Status.UNPROCESSABLE_ENTITY]: {
    description: 'The request was valid but could not be processed.',
    content: {
      [http.MediaTypes.JSON]: {
        schema: UnprocessableEntityErrorSchema,
      },
    },
  },
  [http.Status.BAD_REQUEST]: {
    description: 'The request was invalid or cannot be processed.',
    content: {
      [http.MediaTypes.JSON]: {
        schema: BadRequestErrorSchema,
      },
    },
  },
  [http.Status.INTERNAL_SERVER_ERROR]: {
    description: 'An unexpected error occurred.',
    content: {
      [http.MediaTypes.JSON]: {
        schema: InternalServerErrorSchema,
      },
    },
  },
}
