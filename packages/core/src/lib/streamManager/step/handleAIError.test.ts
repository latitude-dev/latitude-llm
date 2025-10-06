import { APICallError } from 'ai'
import { describe, expect, it } from 'vitest'

import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { handleAIError } from './handleAIError'

describe('handleAIError', () => {
  describe('APICallError handling', () => {
    it('throws ChainError with AIRunError', () => {
      const apiError = new APICallError({
        message: 'API call failed',
        url: 'https://api.openai.com',
        responseBody: 'Rate limit exceeded',
        requestBodyValues: {},
      })

      expect(() => handleAIError({ error: apiError })).toThrow(
        new ChainError({
          code: RunErrorCodes.AIRunError,
          message: 'Rate limit exceeded',
        }),
      )
    })

    it('throws ChainError with AIRunError without responseBody', () => {
      const apiError = new APICallError({
        message: 'API call failed',
        url: 'https://api.openai.com',
        requestBodyValues: {},
      })

      expect(() => handleAIError({ error: apiError })).toThrow(
        new ChainError({
          code: RunErrorCodes.AIRunError,
          message: 'An error occurred during AI call',
        }),
      )
    })

    it('extracts nested error message from APICallError data', () => {
      const apiError = new APICallError({
        message: 'API call failed',
        url: 'https://api.openai.com',
        responseBody: 'Generic response body',
        requestBodyValues: {},
        data: {
          error: {
            message: 'Specific nested error message',
          },
        },
      })

      expect(() => handleAIError({ error: apiError })).toThrow(
        new ChainError({
          code: RunErrorCodes.AIRunError,
          message: 'Specific nested error message',
        }),
      )
    })

    it('falls back to responseBody when data.error structure is invalid', () => {
      const apiError = new APICallError({
        message: 'API call failed',
        url: 'https://api.openai.com',
        responseBody: 'Fallback response body',
        requestBodyValues: {},
        data: {
          // Invalid structure - missing error.message
          error: {
            code: 'some_error_code',
          },
        },
      })

      expect(() => handleAIError({ error: apiError })).toThrow(
        new ChainError({
          code: RunErrorCodes.AIRunError,
          message: 'Fallback response body',
        }),
      )
    })

    it('falls back to responseBody when data is not an object', () => {
      const apiError = new APICallError({
        message: 'API call failed',
        url: 'https://api.openai.com',
        responseBody: 'Response body fallback',
        requestBodyValues: {},
        data: 'invalid data type',
      })

      expect(() => handleAIError({ error: apiError })).toThrow(
        new ChainError({
          code: RunErrorCodes.AIRunError,
          message: 'Response body fallback',
        }),
      )
    })

    it('falls back to responseBody when data.error.message is not a string', () => {
      const apiError = new APICallError({
        message: 'API call failed',
        url: 'https://api.openai.com',
        responseBody: 'Response body message',
        requestBodyValues: {},
        data: {
          error: {
            message: 123, // Not a string
          },
        },
      })

      expect(() => handleAIError({ error: apiError })).toThrow(
        new ChainError({
          code: RunErrorCodes.AIRunError,
          message: 'Response body message',
        }),
      )
    })

    describe('Generic Error handling', () => {
      it('throws ChainError with AIRunError code for generic Error', () => {
        const genericError = new Error('Something went wrong')

        expect(() => handleAIError({ error: genericError })).toThrow(
          new ChainError({
            code: RunErrorCodes.AIRunError,
            message: 'Something went wrong',
          }),
        )
      })

      it('throws ChainError with AIRunError code for custom Error subclass', () => {
        class CustomError extends Error {
          constructor(message: string) {
            super(message)
            this.name = 'CustomError'
          }
        }

        const customError = new CustomError('Custom error occurred')

        expect(() => handleAIError({ error: customError })).toThrow(
          new ChainError({
            code: RunErrorCodes.AIRunError,
            message: 'Custom error occurred',
          }),
        )
      })
    })

    describe('Unknown error handling', () => {
      it('throws ChainError with Unknown code for string error', () => {
        expect(() => handleAIError({ error: 'string error' })).toThrow(
          new ChainError({
            code: RunErrorCodes.Unknown,
            message: 'An unknown error occurred during AI call',
          }),
        )
      })

      it('throws ChainError with Unknown code for number error', () => {
        expect(() => handleAIError({ error: 42 })).toThrow(
          new ChainError({
            code: RunErrorCodes.Unknown,
            message: 'An unknown error occurred during AI call',
          }),
        )
      })

      it('throws ChainError with Unknown code for null error', () => {
        expect(() => handleAIError({ error: null })).toThrow(
          new ChainError({
            code: RunErrorCodes.Unknown,
            message: 'An unknown error occurred during AI call',
          }),
        )
      })

      it('throws ChainError with Unknown code for undefined error', () => {
        expect(() => handleAIError({ error: undefined })).toThrow(
          new ChainError({
            code: RunErrorCodes.Unknown,
            message: 'An unknown error occurred during AI call',
          }),
        )
      })

      it('throws ChainError with Unknown code for object without Error prototype', () => {
        const plainObject = { message: 'Not an error object' }

        expect(() => handleAIError({ error: plainObject })).toThrow(
          new ChainError({
            code: RunErrorCodes.Unknown,
            message: 'An unknown error occurred during AI call',
          }),
        )
      })
    })

    describe('Edge cases', () => {
      it('handles APICallError with empty data object', () => {
        const apiError = new APICallError({
          message: 'API call failed',
          url: 'https://api.openai.com',
          responseBody: 'Empty data response',
          requestBodyValues: {},
          data: {},
        })

        expect(() => handleAIError({ error: apiError })).toThrow(
          new ChainError({
            code: RunErrorCodes.AIRunError,
            message: 'Empty data response',
          }),
        )
      })

      it('handles APICallError with null data.error', () => {
        const apiError = new APICallError({
          message: 'API call failed',
          url: 'https://api.openai.com',
          responseBody: 'Null error response',
          requestBodyValues: {},
          data: {
            error: null,
          },
        })

        expect(() => handleAIError({ error: apiError })).toThrow(
          new ChainError({
            code: RunErrorCodes.AIRunError,
            message: 'Null error response',
          }),
        )
      })

      it('handles Error with empty message', () => {
        const emptyError = new Error('')

        expect(() => handleAIError({ error: emptyError })).toThrow(
          new ChainError({
            code: RunErrorCodes.AIRunError,
            message: '',
          }),
        )
      })
    })
  })
})
