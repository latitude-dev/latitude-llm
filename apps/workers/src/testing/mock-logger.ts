import type { Mock } from "vitest"
import { vi } from "vitest"

interface MockLogger {
  info: Mock<(...args: unknown[]) => void>
  error: Mock<(...args: unknown[]) => void>
  warn: Mock<(...args: unknown[]) => void>
  debug: Mock<(...args: unknown[]) => void>
}

export const createMockLogger = (): MockLogger => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
})
