import {
  createChain as createLegacyChain,
  readMetadata,
  type ReferencePromptFn,
} from '@latitude-data/compiler'
import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import {
  isPromptLFile,
  scan,
  toPromptLFile,
  type PromptLFile,
} from 'promptl-ai'

import { DocumentVersion, ErrorableEntity } from '../../../browser'
import { createRunError } from '../../runErrors/create'
import { BadRequestError } from './../../../lib/errors'
import { ErrorResult } from './../../../lib/Result'
import { LatitudeError } from './../../../lib/errors'
import { PromisedResult } from './../../../lib/Transaction'
import { Result } from './../../../lib/Result'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { createPromptlChain } from '../../../utils/promptlChain/createFromWorker'

type RunDocumentErrorCodes = RunErrorCodes.ChainCompileError

export class RunDocumentChecker {
  private document: DocumentVersion
  private errorableUuid: string
  private prompt: string
  private referenceFn?: ReferencePromptFn
  private parameters: Record<string, unknown>

  constructor({
    document,
    errorableUuid,
    prompt,
    referenceFn,
    parameters,
  }: {
    document: DocumentVersion
    errorableUuid: string
    prompt: string
    referenceFn?: ReferencePromptFn
    parameters: Record<string, unknown>
  }) {
    this.document = document
    this.errorableUuid = errorableUuid
    this.prompt = prompt
    this.referenceFn = referenceFn
    this.parameters = parameters
  }

  async call() {
    return await this.createChain()
  }

  private async createChain() {
    try {
      if (this.document.promptlVersion === 0) {
        const metadata = await readMetadata({
          prompt: this.prompt,
          fullPath: this.document.path,
          referenceFn: this.referenceFn,
        })

        return Result.ok({
          chain: createLegacyChain({
            prompt: metadata.resolvedPrompt,
            parameters: this.parameters,
            includeSourceMap: true,
          }),
          config: metadata.config,
          isChain: true,
        })
      } else {
        const metadata = await scan({
          prompt: this.prompt,
          fullPath: this.document.path,
          referenceFn: this.referenceFn,
        })

        const processedParameters = await this.processParameters({
          parameters: this.parameters,
          config: metadata.config as LatitudePromptConfig,
        })

        if (processedParameters.error) return processedParameters

        return Result.ok({
          chain: await createPromptlChain({
            prompt: metadata.resolvedPrompt,
            parameters: processedParameters.unwrap(),
            includeSourceMap: true,
          }).then((r) => r.unwrap()),
          config: metadata.config,
          isChain: metadata.isChain,
        })
      }
    } catch (e) {
      const err = e as Error
      const error = new ChainError({
        code: RunErrorCodes.ChainCompileError,
        message: `Error compiling prompt for document uuid: ${this.document.documentUuid} - ${err.message}`,
      })
      await this.saveError(error)
      return Result.error(error)
    }
  }

  private async saveError(error: ChainError<RunDocumentErrorCodes>) {
    await createRunError({
      data: {
        errorableUuid: this.errorableUuid,
        errorableType: ErrorableEntity.DocumentLog,
        code: error.errorCode,
        message: error.message,
        details: error.details,
      },
    }).then((r) => r.unwrap())
  }

  private processParameters({
    parameters,
    config,
  }: {
    parameters: Record<string, unknown>
    config: LatitudePromptConfig
  }): PromisedResult<Record<string, unknown>, LatitudeError> {
    const result = Object.entries(parameters).reduce(
      (acc, [key, value]) => {
        if (typeof value === 'string') {
          try {
            acc[key] = JSON.parse(value as string)
          } catch (e) {
            acc[key] = value
          }
        } else {
          acc[key] = value
        }

        return acc
      },
      {} as Record<string, unknown>,
    )

    return this.convertFileParameters({ parameters: result, config })
  }

  /**
   * Fetches the file metadata for a given URL without downloading the file.
   */
  private async getFileMetadata(
    url: string,
  ): PromisedResult<PromptLFile, LatitudeError> {
    try {
      const response = await fetch(url, { method: 'HEAD' })
      if (!response.ok) {
        return Result.error(new LatitudeError(`Error fetching file: ${url}`))
      }

      const contentDisposition = response.headers.get('Content-Disposition')
      const contentType = response.headers.get('Content-Type')
      const contentLength = response.headers.get('Content-Length')

      let fileName: string | undefined
      if (contentDisposition) {
        const match = contentDisposition.match(/filename\*?=(?:UTF-8'')?(.+)/)
        if (match && match.length >= 2) fileName = decodeURIComponent(match[1]!)
      }
      if (!fileName) {
        const urlPath = new URL(url).pathname
        fileName = urlPath.substring(urlPath.lastIndexOf('/') + 1)
      }

      return Result.ok(
        toPromptLFile({
          url,
          file: {
            name: fileName,
            type: contentType ?? '',
            size: parseInt(contentLength ?? '0'),
          } as File,
        }),
      )
    } catch (e) {
      return Result.error(new LatitudeError(`Error fetching file: ${url}`))
    }
  }

  /**
   * Converts all parameters marked as "file" in the config to the PromptLFile type.
   */
  private async convertFileParameters({
    parameters,
    config,
  }: {
    parameters: Record<string, unknown>
    config: LatitudePromptConfig
  }): PromisedResult<Record<string, unknown>, LatitudeError> {
    if (!config.parameters) return Result.ok(parameters)

    const fileParameterKeys = Object.entries(config.parameters)
      .filter(([, value]) => value.type === 'file')
      .map(([key]) => key)

    const fileResults = await Promise.all(
      fileParameterKeys.map(async (paramName) => {
        const value = parameters[paramName]
        if (isPromptLFile(value)) return Result.nil()
        if (Array.isArray(value) && value.every(isPromptLFile)) {
          return Result.nil()
        }

        if (typeof value !== 'string') {
          return Result.error(
            new BadRequestError(
              `Invalid parameter value for '${paramName}'. Expected a the file URL.`,
            ),
          )
        }
        const fileResult = await this.getFileMetadata(value)
        if (fileResult.error) return fileResult
        parameters[paramName] = fileResult.unwrap()
        return Result.nil()
      }),
    )

    const fileError = fileResults.find((r) => r.error)
    if (fileError) return fileError as ErrorResult<LatitudeError>
    return Result.ok(parameters)
  }
}
