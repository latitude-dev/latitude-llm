import { createChain } from '@latitude-data/compiler'
import { and, eq, isNull } from 'drizzle-orm'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  MockInstance,
  vi,
} from 'vitest'

import {
  DocumentLog,
  EvaluationDto,
  ProviderApiKey,
  User,
  Workspace,
} from '../../browser'
import { database } from '../../client'
import {
  ErrorableEntity,
  LogSources,
  Providers,
  RunErrorCodes,
} from '../../constants'
import { publisher } from '../../events/publisher'
import { Result } from '../../lib'
import * as generateUUIDModule from '../../lib/generateUUID'
import {
  documentLogs,
  evaluationResults,
  evaluations,
  providerApiKeys,
  providerLogs,
  runErrors,
} from '../../schema'
import * as factories from '../../tests/factories'
import { ChainError } from '../chains/ChainErrors'
import * as runChainModule from '../chains/run'
import { serialize } from '../documentLogs/serialize'
import { runEvaluation } from './run'

const publisherSpy = vi.spyOn(publisher, 'publishLater')

const FAKE_GENERATED_UUID = '12345678-1234-1234-1234-123456789012'
const stream = new ReadableStream({
  start(controller) {
    controller.enqueue({ type: 'text', text: 'foo' })
    controller.close()
  },
})

async function findError(errorCode: RunErrorCodes) {
  return database.query.runErrors.findFirst({
    where: and(
      eq(runErrors.code, errorCode),
      eq(runErrors.errorableUuid, FAKE_GENERATED_UUID),
      eq(runErrors.errorableType, ErrorableEntity.EvaluationResult),
    ),
  })
}

let documentLog: DocumentLog
let documentUuid: string
let workspace: Workspace
let user: User
let evaluation: EvaluationDto
let provider: ProviderApiKey
let runChainResponse: runChainModule.ChainResponse<'object'>
let runChainSpy: MockInstance

describe('run', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    vi.spyOn(generateUUIDModule, 'generateUUIDIdentifier').mockReturnValue(
      FAKE_GENERATED_UUID,
    )

    const setup = await factories.createProject({
      providers: [{ name: 'openai', type: Providers.OpenAI }],
      documents: {
        doc1: factories.helpers.createPrompt({
          provider: 'openai',
          content: 'foo',
        }),
      },
    })
    workspace = setup.workspace
    provider = setup.providers[0]!
    const documentVersion = setup.documents[0]!
    user = setup.user
    documentUuid = documentVersion.documentUuid
    const { documentLog: docLog } = await factories.createDocumentLog({
      document: setup.documents[0]!,
      commit: setup.commit,
    })
    documentLog = docLog
    await factories.createProviderLog({
      documentLogUuid: documentLog.uuid,
      providerId: provider.id,
      providerType: Providers.OpenAI,
      generatedAt: new Date('2024-10-12T10:00:00'),
    })
    await factories.createProviderLog({
      documentLogUuid: documentLog.uuid,
      providerId: provider.id,
      providerType: Providers.OpenAI,
      generatedAt: new Date('2024-10-10T10:00:00'),
    })
    evaluation = await factories.createLlmAsJudgeEvaluation({
      user: setup.user,
      workspace,
      name: 'Test Evaluation',
    })
  })

  describe('happy path', () => {
    beforeEach(async () => {
      const resultProviderLog = await factories.createProviderLog({
        documentLogUuid: documentLog.uuid,
        providerId: provider.id,
        providerType: Providers.OpenAI,
      })
      runChainResponse = Result.ok({
        streamType: 'object' as 'object',
        object: { result: '42', reason: 'Is always 42' },
        text: 'chain resolved text',
        usage: { promptTokens: 8, completionTokens: 2, totalTokens: 10 },
        documentLogUuid: FAKE_GENERATED_UUID,
        providerLog: resultProviderLog,
      })
      runChainSpy = vi.spyOn(runChainModule, 'runChain').mockResolvedValue({
        stream,
        response: new Promise((resolve) => resolve(runChainResponse)),
        resolvedContent: 'chain resolved text',
        errorableUuid: FAKE_GENERATED_UUID,
        duration: new Promise((resolve) => resolve(1000)),
      })
    })

    afterEach(() => {
      runChainSpy.mockRestore()
    })

    it('calls runChain', async () => {
      await runEvaluation({
        documentLog,
        documentUuid,
        evaluation,
      })

      const providerUsed = await database.query.providerApiKeys.findFirst({
        where: eq(providerApiKeys.id, provider.id),
      })

      const serializeResult = await serialize({
        workspace,
        documentLog,
      })
      const serializedPrompt = serializeResult.value
      const chain = createChain({
        prompt: evaluation.metadata.prompt,
        parameters: { ...serializedPrompt },
      })
      expect(runChainModule.runChain).toHaveBeenCalledWith({
        generateUUID: expect.any(Function),
        errorableType: ErrorableEntity.EvaluationResult,
        workspace,
        chain,
        source: LogSources.Evaluation,
        providersMap: new Map().set(provider.name, providerUsed),
        configOverrides: {
          schema: {
            properties: {
              reason: { type: 'string' },
              result: { type: 'string' },
            },
            required: ['result', 'reason'],
            type: 'object',
          },
          output: 'object',
        },
      })
    })

    it('creates evaluation result', async () => {
      await runEvaluation({
        documentLog,
        documentUuid,
        evaluation,
      })
      const evaluationResult = await database.query.evaluationResults.findFirst(
        {
          where: and(
            eq(evaluationResults.documentLogId, documentLog.id),
            eq(evaluationResults.evaluationId, evaluation.id),
          ),
        },
      )

      expect(evaluationResult).toMatchObject({
        uuid: FAKE_GENERATED_UUID,
        resultableType: evaluation.configuration.type,
        source: LogSources.API,
      })
    })

    it('returns run chain result', async () => {
      const result = await runEvaluation({
        documentLog,
        documentUuid,
        evaluation,
      })

      expect(result).toEqual(
        Result.ok({
          stream,
          response: new Promise((resolve) => resolve(runChainResponse)),
          resolvedContent: 'chain resolved text',
          errorableUuid: FAKE_GENERATED_UUID,
          duration: new Promise((resolve) => resolve(1000)),
        }),
      )
    })

    it('publishes evaluation result created event', async () => {
      const run = await runEvaluation({
        documentLog,
        documentUuid,
        evaluation,
      })

      const response = await run.value?.response
      const responseValue = response!.value!
      expect(publisherSpy).toHaveBeenCalledWith({
        type: 'evaluationRun',
        data: {
          response: responseValue,
          documentUuid: documentUuid,
          documentLogUuid: documentLog.uuid,
          evaluationId: evaluation.id,
          providerLogUuid: responseValue.providerLog!.uuid,
          workspaceId: workspace.id,
        },
      })
    })
  })

  describe('errors', () => {
    it('fails when workspace is not found', async () => {
      const nonExistingDocumentUuid = '12345678-1234-1234-1234-123456789033'
      const docLogs = await database
        .update(documentLogs)
        .set({
          documentUuid: nonExistingDocumentUuid,
        })
        .where(eq(documentLogs.id, documentLog.id))
        .returning()
      const updatedDocumentLog = docLogs[0]!
      const result = await runEvaluation({
        documentLog: updatedDocumentLog,
        documentUuid,
        evaluation,
      })
      const error = await findError(
        RunErrorCodes.EvaluationRunMissingWorkspaceError,
      )
      expect(error).toBeDefined()
      expect(result.error).toEqual(
        new ChainError({
          code: RunErrorCodes.EvaluationRunMissingWorkspaceError,
          message: `Workspace not found for documentLogUuid ${updatedDocumentLog.uuid}`,
        }),
      )

      expect(publisherSpy).not.toHaveBeenCalledWith({
        type: 'evaluationRun',
        data: {
          documentUuid: documentUuid,
          documentLogUuid: documentLog.uuid,
          evaluationId: evaluation.id,
          workspaceId: workspace.id,
        },
      })

      const evaluationResult = await database.query.evaluationResults.findFirst(
        {
          where: and(
            eq(evaluationResults.evaluationId, evaluation.id),
            eq(evaluationResults.documentLogId, documentLog.id),
            isNull(evaluationResults.providerLogId),
            isNull(evaluationResults.resultableId),
          ),
        },
      )

      expect(evaluationResult).toBeDefined()
    })

    it('fails when provider logs are not found', async () => {
      await database
        .delete(providerLogs)
        .where(eq(providerLogs.documentLogUuid, documentLog.uuid))
      const result = await runEvaluation({
        documentLog,
        documentUuid,
        evaluation,
      })
      const error = await findError(
        RunErrorCodes.EvaluationRunMissingProviderLogError,
      )
      expect(error).toBeDefined()
      expect(result.error).toEqual(
        new ChainError({
          code: RunErrorCodes.EvaluationRunMissingProviderLogError,
          message: `Could not serialize documentLog ${documentLog.uuid}. No provider logs found.`,
        }),
      )
    })

    it('fails evaluation type is not recognized', async () => {
      const evals = await database
        .update(evaluations)
        .set({
          configuration: {
            ...evaluation.configuration,
            // @ts-expect-error - intentionally setting invalid type
            type: 'unknown',
          },
        })
        .where(eq(evaluations.id, evaluation.id))
        .returning()
      const updatedEvaluation = evals[0]!

      const result = await runEvaluation({
        documentLog,
        documentUuid,
        evaluation: {
          ...updatedEvaluation,
          metadata: { prompt: 'foo' },
        } as EvaluationDto,
      })
      const error = await findError(
        RunErrorCodes.EvaluationRunUnsupportedResultTypeError,
      )
      const evaluationResult = await database.query.evaluationResults.findFirst(
        {
          where: eq(evaluationResults.evaluationId, updatedEvaluation.id),
        },
      )

      expect(evaluationResult).toEqual(
        expect.objectContaining({
          uuid: error?.errorableUuid,
          documentLogId: documentLog.id,
          evaluationId: updatedEvaluation.id,
          resultableType: null,
          resultableId: null,
          source: LogSources.API,
        }),
      )
      expect(error).toBeDefined()
      expect(result.error).toEqual(
        new ChainError({
          code: RunErrorCodes.EvaluationRunUnsupportedResultTypeError,
          message: `Unsupported evaluation type 'unknown'`,
        }),
      )
    })

    it('fails when chain response without object', async () => {
      const resultProviderLog = await factories.createProviderLog({
        documentLogUuid: documentLog.uuid,
        providerId: provider.id,
        providerType: Providers.OpenAI,
      })
      runChainResponse = Result.ok({
        streamType: 'object' as 'object',
        object: undefined,
        text: 'chain resolved text',
        usage: { promptTokens: 8, completionTokens: 2, totalTokens: 10 },
        documentLogUuid: FAKE_GENERATED_UUID,
        providerLog: resultProviderLog,
      })

      runChainSpy = vi.spyOn(runChainModule, 'runChain').mockResolvedValue({
        stream,
        response: new Promise((resolve) => resolve(runChainResponse)),
        resolvedContent: 'chain resolved text',
        errorableUuid: FAKE_GENERATED_UUID,
        duration: new Promise((resolve) => resolve(1000)),
      })

      const result = await runEvaluation({
        documentLog,
        documentUuid,
        evaluation,
      })

      expect(result.error).toEqual(
        new ChainError({
          code: RunErrorCodes.EvaluationRunResponseJsonFormatError,
          message:
            'Provider with model [gpt-4o] did not return a valid JSON object',
        }),
      )
      runChainSpy.mockRestore()
    })

    it('saves only once the error', async () => {
      const brokenPromptEvaluation = await factories.createLlmAsJudgeEvaluation(
        {
          user: user,
          workspace,
          name: 'Test Evaluation',
          prompt: `
          ---
          provider: openai
          model: gpt-4o-mini
          ---
          {{#if condition}}
            It fail because "condition" is not defined
          {{/if}}
        `,
        },
      )
      await runEvaluation({
        documentLog,
        documentUuid,
        evaluation: brokenPromptEvaluation,
      })
      const errors = await database.query.runErrors.findMany({
        where: eq(runErrors.errorableUuid, FAKE_GENERATED_UUID),
      })

      expect(errors.length).toEqual(1)
    })
  })
})
