---
name: testing
description: Testing guidelines and patterns for Latitude LLM. Use when writing, reviewing, or debugging tests. Triggers on tasks involving unit tests, integration tests, mocking, factories, Result pattern testing, or test file structure.
license: MIT
metadata:
  author: latitude
  version: "1.0.0"
---

# Testing

Guidelines and patterns for writing tests in Latitude LLM.

## When to Apply

Reference these guidelines when:
- Writing new tests for services, repositories, or components
- Setting up mocks for external dependencies
- Testing Result pattern responses
- Structuring test files
- Debugging failing tests

## Quick Reference

- Use factories extensively, minimize mocks for integration tests
- Tests located alongside source files with `.test.ts` extension
- To run tests for a specific package, `cd` into the package directory and run:
  - `pnpm test -- "path/to/file.test.ts"` - Run a specific test file
  - `pnpm test -- "path/to/directory"` - Run all tests in a directory
  - `pnpm test` - Run all tests in the package

## Unit Test Patterns

When writing unit tests for services that depend on external modules (disk, cache, database):

### 1. Use `vi.spyOn` for module mocking

Import modules with `* as moduleAlias` and spy on specific functions:

```typescript
import * as cacheModule from '../../cache'
import * as diskModule from '../../lib/disk'

beforeEach(() => {
  vi.spyOn(diskModule, 'diskFactory').mockReturnValue(mockDisk as any)
  vi.spyOn(cacheModule, 'cache').mockResolvedValue(mockCache as any)
})
```

### 2. Create mock objects with `vi.fn()`

Define mock implementations for all methods used by the code under test:

```typescript
const mockDisk = {
  exists: vi.fn(),
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}

const mockCache = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
}
```

### 3. Clear mocks between tests

Use `beforeEach` to reset mock state:

```typescript
beforeEach(() => {
  vi.clearAllMocks()
  // Re-apply spies after clearing
})
```

### 4. Test Result pattern responses

Services return `Result` objects, check both success and error cases:

```typescript
// Success case
expect(result.ok).toBe(true)
expect(result.value).toEqual(expectedValue)

// Error case
expect(result.ok).toBe(false)
expect(result.error?.message).toBe('Expected error message')
```

### 5. Test edge cases and error paths

Include tests for:
- Missing data (cache miss, file not found)
- Expired/stale entries
- External service failures (disk errors, cache errors)
- Silent error handling (when errors are caught and swallowed)

### 6. Use `@ts-expect-error` for intentional type violations

When testing with incomplete mocks:

```typescript
// @ts-expect-error - mock
vi.spyOn(cacheModule, 'cache').mockResolvedValue(mockCache)
```

## Test Structure

Follow this structure for test files:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('moduleName', () => {
  // Mock setup
  const mockDependency = { method: vi.fn() }

  beforeEach(() => {
    vi.clearAllMocks()
    // Apply spies
  })

  describe('functionName', () => {
    it('describes expected behavior', async () => {
      // Arrange - set up mock return values
      mockDependency.method.mockResolvedValueOnce(value)

      // Act - call the function under test
      const result = await functionUnderTest(args)

      // Assert - verify the result and mock interactions
      expect(result).toEqual(expected)
      expect(mockDependency.method).toHaveBeenCalledWith(expectedArgs)
    })
  })
})
```
