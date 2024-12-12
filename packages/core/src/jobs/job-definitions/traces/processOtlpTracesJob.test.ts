import { describe, it, expect, vi } from 'vitest'
import { Job } from 'bullmq'
import {
  processOtlpTracesJob,
  ProcessOtlpTracesJobData,
} from './processOtlpTracesJob'
import { bulkCreateTracesAndSpans } from '../../../services/traces/bulkCreateTracesAndSpans'
import { createProject } from '../../../tests/factories'

// Mock the bulkCreateTracesAndSpans function
vi.mock('../../../services/traces/bulkCreateTracesAndSpans', () => ({
  bulkCreateTracesAndSpans: vi.fn(),
}))

describe('processOtlpTracesJob', () => {
  it('should process OTLP traces and create them in the workspace', async () => {
    // Arrange
    const { workspace } = await createProject()
    const mockSpans = [
      {
        span: {
          traceId: 'trace-1',
          spanId: 'span-1',
          name: 'test-span-1',
          kind: 1,
          startTimeUnixNano: '1700000000000000000',
          endTimeUnixNano: '1700000001000000000',
          attributes: [],
        },
        resourceAttributes: [
          {
            key: 'service.name',
            value: {
              stringValue: 'test-service',
            },
          },
        ],
      },
      {
        span: {
          traceId: 'trace-1', // Same trace as above
          spanId: 'span-2',
          name: 'test-span-2',
          kind: 1,
          startTimeUnixNano: '1700000000500000000',
          endTimeUnixNano: '1700000001500000000',
          attributes: [],
        },
        resourceAttributes: [
          {
            key: 'service.name',
            value: {
              stringValue: 'test-service',
            },
          },
        ],
      },
    ]

    const jobData: ProcessOtlpTracesJobData = {
      spans: mockSpans,
      workspace,
    }

    const job = {
      data: jobData,
    } as Job<ProcessOtlpTracesJobData>

    // Act
    await processOtlpTracesJob(job)

    // Assert
    expect(bulkCreateTracesAndSpans).toHaveBeenCalledWith({
      workspace,
      traces: [
        {
          traceId: 'trace-1',
          startTime: new Date(1700000000000),
          endTime: new Date(1700000001000),
          attributes: {
            'service.name': 'test-service',
          },
        },
      ],
      spans: expect.arrayContaining([
        expect.objectContaining({
          spanId: 'span-1',
          name: 'test-span-1',
        }),
        expect.objectContaining({
          spanId: 'span-2',
          name: 'test-span-2',
        }),
      ]),
    })
  })

  it('should handle spans without endTime', async () => {
    // Arrange
    const { workspace } = await createProject()
    const mockSpans = [
      {
        span: {
          traceId: 'trace-1',
          spanId: 'span-1',
          name: 'test-span',
          kind: 1,
          startTimeUnixNano: '1700000000000000000',
          // No endTimeUnixNano
          attributes: [],
        },
        resourceAttributes: [
          {
            key: 'service.name',
            value: {
              stringValue: 'test-service',
            },
          },
        ],
      },
    ]

    const jobData: ProcessOtlpTracesJobData = {
      spans: mockSpans,
      workspace,
    }

    const job = {
      data: jobData,
    } as Job<ProcessOtlpTracesJobData>

    // Act
    await processOtlpTracesJob(job)

    // Assert
    expect(bulkCreateTracesAndSpans).toHaveBeenCalledWith({
      workspace,
      traces: [
        {
          traceId: 'trace-1',
          startTime: new Date(1700000000000),
          endTime: undefined,
          attributes: {
            'service.name': 'test-service',
          },
        },
      ],
      spans: expect.arrayContaining([
        expect.objectContaining({
          spanId: 'span-1',
          name: 'test-span',
        }),
      ]),
    })
  })
})
