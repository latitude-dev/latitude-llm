import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Message } from '@latitude-data/constants/messages'
import {
  MAX_SIMULATION_TURNS,
  SimulationSettings,
} from '@latitude-data/constants/simulation'
import { Result } from '../../../../lib/Result'
import { LatitudeError } from '../../../../lib/errors'
import { RedisStream } from '../../../../lib/redisStream'
import { WorkspaceDto } from '../../../../schema/models/types/Workspace'
import { ToolHandler } from '../../../../services/documents/tools/clientTools/handlers'
import * as simulateUserResponseModule from '../../../../services/simulation/simulateUserResponse'
import * as addMessagesModule from '../../../../services/addMessages'
import * as streamManagementModule from './streamManagement'
import * as datadogModule from '../../../../utils/datadogCapture'
import {
  shouldRunMultiTurnSimulation,
  simulateUserResponses,
} from './multiTurnSimulation'

vi.mock('../../../../services/simulation/simulateUserResponse')
vi.mock('../../../../services/addMessages')
vi.mock('./streamManagement')
vi.mock('../../../../utils/datadogCapture')

type SimulatedUserAction =
  | { action: 'end' }
  | { action: 'respond'; message: string }

const createEmptyMockMetrics = () => ({
  runUsage: Promise.resolve({
    inputTokens: 0,
    outputTokens: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    reasoningTokens: 0,
    cachedInputTokens: 0,
  }),
  runCost: Promise.resolve(0),
  duration: Promise.resolve(0),
})

type SimulateUserResponsesArgs = {
  initialMessages: Message[]
  workspace: WorkspaceDto
  documentLogUuid: string
  simulationSettings: SimulationSettings
  tools: Record<string, ToolHandler>
  mcpHeaders?: Record<string, Record<string, string>>
  abortSignal?: AbortSignal
  writeStream: RedisStream
  workspaceId: number
  projectId: number
  documentUuid: string
  commitUuid: string
  runUuid: string
}

describe('multiTurnSimulation', () => {
  describe('shouldRunMultiTurnSimulation', () => {
    it('returns false when simulationSettings is undefined', () => {
      expect(shouldRunMultiTurnSimulation(undefined)).toBe(false)
    })

    it('returns false when maxTurns is undefined', () => {
      expect(shouldRunMultiTurnSimulation({})).toBe(false)
    })

    it('returns false when maxTurns is 1', () => {
      expect(shouldRunMultiTurnSimulation({ maxTurns: 1 })).toBe(false)
    })

    it('returns false when maxTurns is 0', () => {
      expect(shouldRunMultiTurnSimulation({ maxTurns: 0 })).toBe(false)
    })

    it('returns true when maxTurns is greater than 1', () => {
      expect(shouldRunMultiTurnSimulation({ maxTurns: 2 })).toBe(true)
      expect(shouldRunMultiTurnSimulation({ maxTurns: 5 })).toBe(true)
      expect(shouldRunMultiTurnSimulation({ maxTurns: 10 })).toBe(true)
    })
  })

  describe('simulateUserResponses', () => {
    let mockWriteStream: RedisStream
    let mockWorkspace: WorkspaceDto
    let baseArgs: SimulateUserResponsesArgs

    beforeEach(() => {
      vi.clearAllMocks()

      mockWriteStream = {
        write: vi.fn(),
        cleanup: vi.fn(),
        close: vi.fn().mockReturnValue(Promise.resolve()),
      } as unknown as RedisStream

      mockWorkspace = { id: 1, name: 'Test Workspace' } as WorkspaceDto

      baseArgs = {
        initialMessages: [
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'Hello, how can I help?' }],
            toolCalls: null,
          },
        ],
        workspace: mockWorkspace,
        documentLogUuid: 'doc-log-123',
        simulationSettings: { maxTurns: 3 },
        tools: {},
        writeStream: mockWriteStream,
        workspaceId: 1,
        projectId: 1,
        documentUuid: 'doc-123',
        commitUuid: 'commit-123',
        runUuid: 'run-123',
      }

      vi.mocked(streamManagementModule.forwardStreamEvents).mockResolvedValue(
        undefined,
      )
    })

    it('returns early when simulationSettings has maxTurns undefined', async () => {
      await simulateUserResponses({
        ...baseArgs,
        simulationSettings: {},
      })

      expect(
        simulateUserResponseModule.generateSimulatedUserAction,
      ).not.toHaveBeenCalled()
    })

    it('returns early when maxTurns is 1', async () => {
      await simulateUserResponses({
        ...baseArgs,
        simulationSettings: { maxTurns: 1 },
      })

      expect(
        simulateUserResponseModule.generateSimulatedUserAction,
      ).not.toHaveBeenCalled()
    })

    it('executes multiple turns until maxTurns is reached', async () => {
      const mockStream = new ReadableStream()
      const updatedMessages = [
        ...baseArgs.initialMessages,
        {
          role: 'user',
          content: [{ type: 'text', text: 'Simulated response' }],
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Assistant reply' }],
        },
      ]

      vi.mocked(
        simulateUserResponseModule.generateSimulatedUserAction,
      ).mockResolvedValue(
        Result.ok({
          action: 'respond',
          message: 'Simulated user message',
        } as SimulatedUserAction),
      )

      vi.mocked(addMessagesModule.addMessages).mockResolvedValue(
        Result.ok({
          stream: mockStream,
          messages: Promise.resolve(updatedMessages),
          ...createEmptyMockMetrics(),
        }) as any,
      )

      await simulateUserResponses(baseArgs)

      expect(
        simulateUserResponseModule.generateSimulatedUserAction,
      ).toHaveBeenCalledTimes(2)
      expect(addMessagesModule.addMessages).toHaveBeenCalledTimes(2)
      expect(streamManagementModule.forwardStreamEvents).toHaveBeenCalledTimes(
        2,
      )
    })

    it('stops execution when simulated user decides to end', async () => {
      vi.mocked(
        simulateUserResponseModule.generateSimulatedUserAction,
      ).mockResolvedValue(
        Result.ok({
          action: 'end',
        } as SimulatedUserAction),
      )

      await simulateUserResponses({
        ...baseArgs,
        simulationSettings: { maxTurns: 5 },
      })

      expect(
        simulateUserResponseModule.generateSimulatedUserAction,
      ).toHaveBeenCalledTimes(1)
      expect(addMessagesModule.addMessages).not.toHaveBeenCalled()
    })

    it('handles abort signal correctly', async () => {
      const abortController = new AbortController()
      const mockStream = new ReadableStream()
      const updatedMessages = [...baseArgs.initialMessages]

      let callCount = 0
      vi.mocked(
        simulateUserResponseModule.generateSimulatedUserAction,
      ).mockImplementation(async () => {
        callCount++
        if (callCount === 1) {
          abortController.abort()
        }
        return Result.ok({
          action: 'respond',
          message: 'Response',
        } as SimulatedUserAction)
      })

      vi.mocked(addMessagesModule.addMessages).mockResolvedValue(
        Result.ok({
          stream: mockStream,
          messages: Promise.resolve(updatedMessages),
          ...createEmptyMockMetrics(),
        }) as any,
      )

      await simulateUserResponses({
        ...baseArgs,
        simulationSettings: { maxTurns: 5 },
        abortSignal: abortController.signal,
      })

      expect(
        simulateUserResponseModule.generateSimulatedUserAction,
      ).toHaveBeenCalledTimes(1)
    })

    it('handles errors from generateSimulatedUserAction', async () => {
      const error = new LatitudeError('Simulation failed')

      vi.mocked(
        simulateUserResponseModule.generateSimulatedUserAction,
      ).mockResolvedValue(Result.error(error))

      await simulateUserResponses(baseArgs)

      expect(datadogModule.captureException).toHaveBeenCalledWith(error)
      expect(addMessagesModule.addMessages).not.toHaveBeenCalled()
    })

    it('handles errors from addMessages', async () => {
      const error = new LatitudeError('Failed to add messages')

      vi.mocked(
        simulateUserResponseModule.generateSimulatedUserAction,
      ).mockResolvedValue(
        Result.ok({
          action: 'respond',
          message: 'Simulated response',
        } as SimulatedUserAction),
      )

      vi.mocked(addMessagesModule.addMessages).mockResolvedValue(
        Result.error(error),
      )

      await simulateUserResponses(baseArgs)

      expect(datadogModule.captureException).toHaveBeenCalledWith(error)
      expect(streamManagementModule.forwardStreamEvents).not.toHaveBeenCalled()
    })

    it('respects MAX_SIMULATION_TURNS cap', async () => {
      const mockStream = new ReadableStream()
      const updatedMessages = [...baseArgs.initialMessages]

      vi.mocked(
        simulateUserResponseModule.generateSimulatedUserAction,
      ).mockResolvedValue(
        Result.ok({
          action: 'respond',
          message: 'Response',
        } as SimulatedUserAction),
      )

      vi.mocked(addMessagesModule.addMessages).mockResolvedValue(
        Result.ok({
          stream: mockStream,
          messages: Promise.resolve(updatedMessages),
          ...createEmptyMockMetrics(),
        }) as any,
      )

      await simulateUserResponses({
        ...baseArgs,
        simulationSettings: { maxTurns: 100 },
      })

      expect(
        simulateUserResponseModule.generateSimulatedUserAction,
      ).toHaveBeenCalledTimes(MAX_SIMULATION_TURNS - 1)
    })

    it('passes correct parameters to generateSimulatedUserAction', async () => {
      vi.mocked(
        simulateUserResponseModule.generateSimulatedUserAction,
      ).mockResolvedValue(
        Result.ok({
          action: 'end',
        } as SimulatedUserAction),
      )

      await simulateUserResponses(baseArgs)

      expect(
        simulateUserResponseModule.generateSimulatedUserAction,
      ).toHaveBeenCalledWith({
        messages: baseArgs.initialMessages,
        simulationInstructions: undefined,
        currentTurn: 2,
        maxTurns: 3,
        abortSignal: undefined,
      })
    })

    it('passes correct parameters to addMessages', async () => {
      const mockStream = new ReadableStream()
      const updatedMessages = [...baseArgs.initialMessages]
      const mcpHeaders = { server1: { auth: 'token' } }

      vi.mocked(
        simulateUserResponseModule.generateSimulatedUserAction,
      ).mockResolvedValue(
        Result.ok({
          action: 'respond',
          message: 'User message',
        } as SimulatedUserAction),
      )

      vi.mocked(addMessagesModule.addMessages).mockResolvedValue(
        Result.ok({
          stream: mockStream,
          messages: Promise.resolve(updatedMessages),
          ...createEmptyMockMetrics(),
        }) as any,
      )

      await simulateUserResponses({
        ...baseArgs,
        mcpHeaders,
      })

      expect(addMessagesModule.addMessages).toHaveBeenCalledWith({
        workspace: mockWorkspace,
        documentLogUuid: 'doc-log-123',
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'User message' }],
          },
        ],
        source: expect.any(String),
        tools: {},
        mcpHeaders,
        abortSignal: undefined,
        simulationSettings: { maxTurns: 3 },
      })
    })

    it('passes correct parameters to forwardStreamEvents', async () => {
      const mockStream = new ReadableStream()
      const updatedMessages = [...baseArgs.initialMessages]

      vi.mocked(
        simulateUserResponseModule.generateSimulatedUserAction,
      ).mockResolvedValue(
        Result.ok({
          action: 'respond',
          message: 'Response',
        } as SimulatedUserAction),
      )

      vi.mocked(addMessagesModule.addMessages).mockResolvedValue(
        Result.ok({
          stream: mockStream,
          messages: Promise.resolve(updatedMessages),
          ...createEmptyMockMetrics(),
        }) as any,
      )

      await simulateUserResponses(baseArgs)

      expect(streamManagementModule.forwardStreamEvents).toHaveBeenCalledWith({
        workspaceId: 1,
        projectId: 1,
        documentUuid: 'doc-123',
        commitUuid: 'commit-123',
        runUuid: 'run-123',
        writeStream: mockWriteStream,
        readStream: mockStream,
      })
    })

    it('updates messages between turns', async () => {
      const mockStream = new ReadableStream()
      const turn1Messages = [
        ...baseArgs.initialMessages,
        { role: 'user', content: [{ type: 'text', text: 'Turn 1' }] },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Reply 1' }],
        },
      ]
      const turn2Messages = [
        ...turn1Messages,
        { role: 'user', content: [{ type: 'text', text: 'Turn 2' }] },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Reply 2' }],
        },
      ]

      let addMessagesCallCount = 0
      vi.mocked(addMessagesModule.addMessages).mockImplementation(async () => {
        addMessagesCallCount++
        const messages =
          addMessagesCallCount === 1 ? turn1Messages : turn2Messages
        return Result.ok({
          stream: mockStream,
          messages: Promise.resolve(messages),
          ...createEmptyMockMetrics(),
        }) as any
      })

      vi.mocked(
        simulateUserResponseModule.generateSimulatedUserAction,
      ).mockResolvedValue(
        Result.ok({
          action: 'respond',
          message: 'Response',
        } as SimulatedUserAction),
      )

      await simulateUserResponses(baseArgs)

      const generateCalls = vi.mocked(
        simulateUserResponseModule.generateSimulatedUserAction,
      ).mock.calls

      expect(generateCalls[0]![0].messages).toEqual(baseArgs.initialMessages)
      expect(generateCalls[1]![0].messages).toEqual(turn1Messages)
    })

    it('increments currentTurn correctly', async () => {
      const mockStream = new ReadableStream()
      const updatedMessages = [...baseArgs.initialMessages]

      vi.mocked(
        simulateUserResponseModule.generateSimulatedUserAction,
      ).mockResolvedValue(
        Result.ok({
          action: 'respond',
          message: 'Response',
        } as SimulatedUserAction),
      )

      vi.mocked(addMessagesModule.addMessages).mockResolvedValue(
        Result.ok({
          stream: mockStream,
          messages: Promise.resolve(updatedMessages),
          ...createEmptyMockMetrics(),
        }) as any,
      )

      await simulateUserResponses({
        ...baseArgs,
        simulationSettings: { maxTurns: 4 },
      })

      const generateCalls = vi.mocked(
        simulateUserResponseModule.generateSimulatedUserAction,
      ).mock.calls

      expect(generateCalls[0]![0].currentTurn).toBe(2)
      expect(generateCalls[1]![0].currentTurn).toBe(3)
      expect(generateCalls[2]![0].currentTurn).toBe(4)
    })

    it('does not call addMessages when simulated user ends conversation', async () => {
      vi.mocked(
        simulateUserResponseModule.generateSimulatedUserAction,
      ).mockResolvedValue(
        Result.ok({
          action: 'end',
        } as SimulatedUserAction),
      )

      await simulateUserResponses(baseArgs)

      expect(addMessagesModule.addMessages).not.toHaveBeenCalled()
      expect(streamManagementModule.forwardStreamEvents).not.toHaveBeenCalled()
    })

    describe('metrics aggregation', () => {
      const createMockMetrics = (multiplier: number) => ({
        runUsage: Promise.resolve({
          inputTokens: 100 * multiplier,
          outputTokens: 50 * multiplier,
          promptTokens: 100 * multiplier,
          completionTokens: 50 * multiplier,
          totalTokens: 150 * multiplier,
          reasoningTokens: 10 * multiplier,
          cachedInputTokens: 5 * multiplier,
        }),
        runCost: Promise.resolve(0.01 * multiplier),
        duration: Promise.resolve(1000 * multiplier),
      })

      it('returns empty metrics when maxTurns is 1', async () => {
        const result = await simulateUserResponses({
          ...baseArgs,
          simulationSettings: { maxTurns: 1 },
        })

        expect(Result.isOk(result)).toBe(true)
        const metrics = result.unwrap()
        expect(metrics.runUsage.totalTokens).toBe(0)
        expect(metrics.runCost).toBe(0)
        expect(metrics.duration).toBe(0)
      })

      it('returns empty metrics when simulation ends immediately', async () => {
        vi.mocked(
          simulateUserResponseModule.generateSimulatedUserAction,
        ).mockResolvedValue(Result.ok({ action: 'end' } as SimulatedUserAction))

        const result = await simulateUserResponses(baseArgs)

        expect(Result.isOk(result)).toBe(true)
        const metrics = result.unwrap()
        expect(metrics.runUsage.totalTokens).toBe(0)
        expect(metrics.runCost).toBe(0)
        expect(metrics.duration).toBe(0)
      })

      it('aggregates metrics from a single turn', async () => {
        const mockStream = new ReadableStream()
        const updatedMessages = [...baseArgs.initialMessages]

        vi.mocked(simulateUserResponseModule.generateSimulatedUserAction)
          .mockResolvedValueOnce(
            Result.ok({
              action: 'respond',
              message: 'Response',
            } as SimulatedUserAction),
          )
          .mockResolvedValueOnce(
            Result.ok({ action: 'end' } as SimulatedUserAction),
          )

        vi.mocked(addMessagesModule.addMessages).mockResolvedValue(
          Result.ok({
            stream: mockStream,
            messages: Promise.resolve(updatedMessages),
            ...createMockMetrics(1),
          }) as any,
        )

        const result = await simulateUserResponses(baseArgs)

        expect(Result.isOk(result)).toBe(true)
        const metrics = result.unwrap()
        expect(metrics.runUsage.totalTokens).toBe(150)
        expect(metrics.runCost).toBeCloseTo(0.01)
        expect(metrics.duration).toBe(1000)
      })

      it('aggregates metrics from multiple turns', async () => {
        const mockStream = new ReadableStream()
        const updatedMessages = [...baseArgs.initialMessages]

        vi.mocked(
          simulateUserResponseModule.generateSimulatedUserAction,
        ).mockResolvedValue(
          Result.ok({
            action: 'respond',
            message: 'Response',
          } as SimulatedUserAction),
        )

        let callCount = 0
        vi.mocked(addMessagesModule.addMessages).mockImplementation(
          async () => {
            callCount++
            return Result.ok({
              stream: mockStream,
              messages: Promise.resolve(updatedMessages),
              ...createMockMetrics(callCount),
            }) as any
          },
        )

        const result = await simulateUserResponses({
          ...baseArgs,
          simulationSettings: { maxTurns: 4 },
        })

        expect(Result.isOk(result)).toBe(true)
        const metrics = result.unwrap()
        expect(metrics.runUsage.totalTokens).toBe(150 + 300 + 450)
        expect(metrics.runCost).toBeCloseTo(0.01 + 0.02 + 0.03)
        expect(metrics.duration).toBe(1000 + 2000 + 3000)
      })

      it('returns partial metrics when simulation ends early', async () => {
        const mockStream = new ReadableStream()
        const updatedMessages = [...baseArgs.initialMessages]

        vi.mocked(simulateUserResponseModule.generateSimulatedUserAction)
          .mockResolvedValueOnce(
            Result.ok({
              action: 'respond',
              message: 'Response 1',
            } as SimulatedUserAction),
          )
          .mockResolvedValueOnce(
            Result.ok({ action: 'end' } as SimulatedUserAction),
          )

        vi.mocked(addMessagesModule.addMessages).mockResolvedValue(
          Result.ok({
            stream: mockStream,
            messages: Promise.resolve(updatedMessages),
            ...createMockMetrics(1),
          }) as any,
        )

        const result = await simulateUserResponses({
          ...baseArgs,
          simulationSettings: { maxTurns: 5 },
        })

        expect(Result.isOk(result)).toBe(true)
        const metrics = result.unwrap()
        expect(metrics.runUsage.totalTokens).toBe(150)
        expect(metrics.runCost).toBeCloseTo(0.01)
        expect(metrics.duration).toBe(1000)
      })

      it('returns error result when addMessages fails', async () => {
        const error = new LatitudeError('Failed to add messages')

        vi.mocked(
          simulateUserResponseModule.generateSimulatedUserAction,
        ).mockResolvedValue(
          Result.ok({
            action: 'respond',
            message: 'Response',
          } as SimulatedUserAction),
        )

        vi.mocked(addMessagesModule.addMessages).mockResolvedValue(
          Result.error(error),
        )

        const result = await simulateUserResponses(baseArgs)

        expect(Result.isOk(result)).toBe(false)
      })

      it('aggregates all token types correctly', async () => {
        const mockStream = new ReadableStream()
        const updatedMessages = [...baseArgs.initialMessages]

        vi.mocked(
          simulateUserResponseModule.generateSimulatedUserAction,
        ).mockResolvedValue(
          Result.ok({
            action: 'respond',
            message: 'Response',
          } as SimulatedUserAction),
        )

        vi.mocked(addMessagesModule.addMessages).mockResolvedValue(
          Result.ok({
            stream: mockStream,
            messages: Promise.resolve(updatedMessages),
            ...createMockMetrics(1),
          }) as any,
        )

        const result = await simulateUserResponses({
          ...baseArgs,
          simulationSettings: { maxTurns: 3 },
        })

        expect(Result.isOk(result)).toBe(true)
        const metrics = result.unwrap()
        expect(metrics.runUsage).toEqual({
          inputTokens: 200,
          outputTokens: 100,
          promptTokens: 200,
          completionTokens: 100,
          totalTokens: 300,
          reasoningTokens: 20,
          cachedInputTokens: 10,
        })
      })
    })
  })
})
