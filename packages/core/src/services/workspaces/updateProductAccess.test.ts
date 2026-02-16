import { beforeEach, describe, expect, it } from 'vitest'

import { type Workspace } from '../../schema/models/types/Workspace'
import { createProject } from '../../tests/factories'
import { updateProductAccess } from './updateProductAccess'

describe('updateProductAccess', () => {
  let workspace: Workspace

  beforeEach(async () => {
    const { workspace: w } = await createProject()
    workspace = w
  })

  describe('updating promptManagerEnabled', () => {
    it('should enable prompt manager', async () => {
      const result = await updateProductAccess({
        workspace: { ...workspace, promptManagerEnabled: false },
        promptManagerEnabled: true,
      })

      expect(result.ok).toBe(true)
      expect(result.unwrap().promptManagerEnabled).toBe(true)
    })

    it('should disable prompt manager', async () => {
      const result = await updateProductAccess({
        workspace: { ...workspace, promptManagerEnabled: true },
        promptManagerEnabled: false,
      })

      expect(result.ok).toBe(true)
      expect(result.unwrap().promptManagerEnabled).toBe(false)
    })
  })

  describe('updating agentBuilderEnabled', () => {
    it('should enable agent builder when prompt manager is enabled', async () => {
      const result = await updateProductAccess({
        workspace: {
          ...workspace,
          promptManagerEnabled: true,
          agentBuilderEnabled: false,
        },
        agentBuilderEnabled: true,
      })

      expect(result.ok).toBe(true)
      expect(result.unwrap().agentBuilderEnabled).toBe(true)
    })

    it('should disable agent builder', async () => {
      const result = await updateProductAccess({
        workspace: {
          ...workspace,
          promptManagerEnabled: true,
          agentBuilderEnabled: true,
        },
        agentBuilderEnabled: false,
      })

      expect(result.ok).toBe(true)
      expect(result.unwrap().agentBuilderEnabled).toBe(false)
    })

    it('should not enable agent builder when prompt manager is disabled', async () => {
      const disableResult = await updateProductAccess({
        workspace,
        promptManagerEnabled: false,
      })
      expect(disableResult.ok).toBe(true)
      const disabledWorkspace = disableResult.unwrap()

      const result = await updateProductAccess({
        workspace: disabledWorkspace,
        agentBuilderEnabled: true,
      })

      expect(result.ok).toBe(true)
      const updated = result.unwrap()
      expect(updated.promptManagerEnabled).toBe(false)
      expect(updated.agentBuilderEnabled).toBe(false)
    })
  })

  describe('dependency enforcement', () => {
    it('should auto-disable agent builder when disabling prompt manager', async () => {
      const result = await updateProductAccess({
        workspace: {
          ...workspace,
          promptManagerEnabled: true,
          agentBuilderEnabled: true,
        },
        promptManagerEnabled: false,
      })

      expect(result.ok).toBe(true)
      const updated = result.unwrap()
      expect(updated.promptManagerEnabled).toBe(false)
      expect(updated.agentBuilderEnabled).toBe(false)
    })

    it('should disable agent builder when disabling prompt manager even if trying to enable agent builder', async () => {
      const result = await updateProductAccess({
        workspace: {
          ...workspace,
          promptManagerEnabled: true,
          agentBuilderEnabled: false,
        },
        promptManagerEnabled: false,
        agentBuilderEnabled: true,
      })

      expect(result.ok).toBe(true)
      const updated = result.unwrap()
      expect(updated.promptManagerEnabled).toBe(false)
      expect(updated.agentBuilderEnabled).toBe(false)
    })

    it('should allow enabling both in same request', async () => {
      const result = await updateProductAccess({
        workspace: {
          ...workspace,
          promptManagerEnabled: false,
          agentBuilderEnabled: false,
        },
        promptManagerEnabled: true,
        agentBuilderEnabled: true,
      })

      expect(result.ok).toBe(true)
      const updated = result.unwrap()
      expect(updated.promptManagerEnabled).toBe(true)
      expect(updated.agentBuilderEnabled).toBe(true)
    })

    it('should allow disabling both in same request', async () => {
      const result = await updateProductAccess({
        workspace: {
          ...workspace,
          promptManagerEnabled: true,
          agentBuilderEnabled: true,
        },
        promptManagerEnabled: false,
        agentBuilderEnabled: false,
      })

      expect(result.ok).toBe(true)
      const updated = result.unwrap()
      expect(updated.promptManagerEnabled).toBe(false)
      expect(updated.agentBuilderEnabled).toBe(false)
    })
  })
})
