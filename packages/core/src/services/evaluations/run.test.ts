import { RunErrorCodes } from '@latitude-data/constants/errors'
import { Adapters, Chain } from 'promptl-ai'
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
  ProviderLog,
  User,
  Workspace,
} from '../../browser'
import { database } from '../../client'
import {
  ChainStepResponse,
  ErrorableEntity,
  LogSources,
  Providers,
} from '../../constants'
import { publisher } from '../../events/publisher'
import { Result } from '../../lib'
import * as generateUUIDModule from '../../lib/generateUUID'
import {
  documentLogs,
  evaluationResults,
  providerApiKeys,
  runErrors,
} from '../../schema'
import * as factories from '../../tests/factories'
import { ChainError } from '../../lib/chainStreamManager/ChainErrors'
import * as runChainModule from '../chains/run'
import { serialize } from '../documentLogs/serialize'
import * as createRunErrorModule from '../runErrors/create'
import { getEvaluationPrompt } from './prompt'
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
let providerLog: ProviderLog
let documentUuid: string
let workspace: Workspace
let user: User
let evaluation: EvaluationDto
let provider: ProviderApiKey
let lastResponse: ChainStepResponse<'object'>
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
    const pl = await factories.createProviderLog({
      workspace,
      documentLogUuid: documentLog.uuid,
      providerId: provider.id,
      providerType: Providers.OpenAI,
      generatedAt: new Date('2024-10-12T10:00:00'),
    })
    providerLog = pl
    await factories.createProviderLog({
      workspace,
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
        workspace,
        documentLogUuid: documentLog.uuid,
        providerId: provider.id,
        providerType: Providers.OpenAI,
      })
      const response = {
        streamType: 'object' as 'object',
        object: { result: '42', reason: 'Is always 42' },
        text: 'chain resolved text',
        usage: { promptTokens: 8, completionTokens: 2, totalTokens: 10 },
        documentLogUuid: FAKE_GENERATED_UUID,
        providerLog: resultProviderLog,
      }
      runChainSpy = vi.spyOn(runChainModule, 'runChain').mockReturnValue({
        stream,
        resolvedContent: 'chain resolved text',
        errorableUuid: FAKE_GENERATED_UUID,
        duration: Promise.resolve(1000),
        lastResponse: Promise.resolve(response),
        messages: Promise.resolve([]),
        error: Promise.resolve(undefined),
        toolCalls: Promise.resolve([]),
        conversation: Promise.resolve({ config: {}, messages: [] }),
      })
    })

    afterEach(() => {
      runChainSpy.mockRestore()
    })

    it('calls runChain', async () => {
      await runEvaluation({
        providerLog,
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
      const evaluationPrompt = await getEvaluationPrompt({
        workspace,
        evaluation,
      }).then((r) => r.unwrap())
      const chain = new Chain({
        prompt: evaluationPrompt,
        parameters: { ...serializedPrompt },
        adapter: Adapters.default,
        includeSourceMap: true,
      })
      expect(runChainModule.runChain).toHaveBeenCalledWith({
        generateUUID: expect.any(Function),
        errorableType: ErrorableEntity.EvaluationResult,
        workspace,
        chain,
        promptlVersion: 1,
        source: LogSources.Evaluation,
        promptSource: evaluation,
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
        providerLog,
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
        resultableType: evaluation.resultType,
        source: LogSources.API,
      })
    })

    it('returns run chain result', async () => {
      const result = await runEvaluation({
        providerLog,
        documentUuid,
        evaluation,
      })

      expect(result).toEqual(
        Result.ok({
          stream,
          resolvedContent: 'chain resolved text',
          errorableUuid: FAKE_GENERATED_UUID,
          duration: new Promise((resolve) => resolve(1000)),
          lastResponse: Promise.resolve(lastResponse),
          toolCalls: expect.any(Promise),
          error: expect.any(Promise),
          messages: expect.any(Promise),
          conversation: expect.any(Promise),
        }),
      )
    })

    it('publishes evaluation result created event', async () => {
      const run = await runEvaluation({
        providerLog,
        documentUuid,
        evaluation,
      })

      const response = await run.value?.lastResponse
      expect(publisherSpy).toHaveBeenCalledWith({
        type: 'evaluationRun',
        data: {
          response,
          documentUuid: documentUuid,
          documentLogUuid: documentLog.uuid,
          evaluationId: evaluation.id,
          providerLogUuid: response?.providerLog!.uuid,
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
        providerLog,
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

    it('fails when chain responds without object', async () => {
      const resultProviderLog = await factories.createProviderLog({
        workspace,
        documentLogUuid: documentLog.uuid,
        providerId: provider.id,
        providerType: Providers.OpenAI,
        model: 'gpt-4o',
      })
      lastResponse = {
        streamType: 'object' as 'object',
        object: undefined,
        text: 'chain resolved text',
        usage: { promptTokens: 8, completionTokens: 2, totalTokens: 10 },
        documentLogUuid: FAKE_GENERATED_UUID,
        providerLog: resultProviderLog,
      }

      runChainSpy = vi.spyOn(runChainModule, 'runChain').mockReturnValue({
        stream,
        resolvedContent: 'chain resolved text',
        errorableUuid: FAKE_GENERATED_UUID,
        duration: Promise.resolve(1000),
        lastResponse: Promise.resolve(lastResponse),
        messages: Promise.resolve([]),
        error: Promise.resolve(undefined),
        toolCalls: Promise.resolve([]),
        conversation: Promise.resolve({ config: {}, messages: [] }),
      })

      const result = await runEvaluation({
        providerLog,
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
      const evaluationResult = await database.query.evaluationResults.findFirst(
        {
          where: and(
            eq(evaluationResults.evaluationId, evaluation.id),
            eq(evaluationResults.documentLogId, documentLog.id),
            isNull(evaluationResults.resultableId),
          ),
        },
      )
      const error = await database.query.runErrors.findFirst({
        where: and(
          eq(runErrors.errorableUuid, evaluationResult!.uuid),
          eq(runErrors.errorableType, ErrorableEntity.EvaluationResult),
        ),
      })

      expect(error).toBeDefined()
      expect(evaluationResult).toBeDefined()
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
          {{if condition}}
            It fails because "condition" is not defined
          {{endif}}
        `,
        },
      )
      const spy = vi.spyOn(createRunErrorModule, 'createRunError')
      expect(spy).not.toHaveBeenCalled()

      await runEvaluation({
        providerLog,
        documentUuid,
        evaluation: brokenPromptEvaluation,
      })

      expect(spy).toHaveBeenCalledOnce()
    })
  })
})
