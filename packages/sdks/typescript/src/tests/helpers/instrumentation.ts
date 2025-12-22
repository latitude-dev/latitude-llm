import { Instrumentation, Latitude } from '$sdk/index'
import { vi } from 'vitest'

export class MockInstrumentation implements Instrumentation {
  wrapRenderChain = vi.fn(
    async <F extends Latitude['renderChain']>(
      fn: F,
      ...args: Parameters<F>
    ): Promise<Awaited<ReturnType<F>>> => {
      return await ((fn as any)(...args) as ReturnType<F>)
    },
  )

  wrapRenderCompletion = vi.fn(
    async <F extends Latitude['renderCompletion']>(
      fn: F,
      ...args: Parameters<F>
    ): Promise<Awaited<ReturnType<F>>> => {
      return await ((fn as any)(...args) as ReturnType<F>)
    },
  )

  wrapRenderTool = vi.fn(
    async <F extends Latitude['renderTool']>(
      fn: F,
      ...args: Parameters<F>
    ): Promise<Awaited<ReturnType<F>>> => {
      return await ((fn as any)(...args) as ReturnType<F>)
    },
  )

  mockClear() {
    this.wrapRenderChain.mockClear()
    this.wrapRenderCompletion.mockClear()
    this.wrapRenderTool.mockClear()
  }

  mockReset() {
    this.wrapRenderChain.mockReset()
    this.wrapRenderCompletion.mockReset()
    this.wrapRenderTool.mockReset()
  }

  mockRestore() {
    this.wrapRenderChain.mockRestore()
    this.wrapRenderCompletion.mockRestore()
    this.wrapRenderTool.mockRestore()
  }
}
