import { Instrumentation, Latitude, ToolHandler } from '$sdk/index'
import { vi } from 'vitest'

export class MockInstrumentation implements Instrumentation {
  withTraceContext = vi.fn(
    <F extends () => ReturnType<F>>(
      _carrier: Record<string, unknown>,
      fn: F,
    ): ReturnType<F> => {
      return fn()
    },
  )

  wrapToolHandler = vi.fn(
    async <F extends ToolHandler<any, any>>(
      fn: F,
      ...args: Parameters<F>
    ): Promise<Awaited<ReturnType<F>>> => {
      return await ((fn as any)(...args) as ReturnType<F>)
    },
  )

  wrapRenderChain = vi.fn(
    async <F extends Latitude['renderChain']>(
      fn: F,
      ...args: Parameters<F>
    ): Promise<Awaited<ReturnType<F>>> => {
      return await ((fn as any)(...args) as ReturnType<F>)
    },
  )

  wrapRenderAgent = vi.fn(
    async <F extends Latitude['renderAgent']>(
      fn: F,
      ...args: Parameters<F>
    ): Promise<Awaited<ReturnType<F>>> => {
      return await ((fn as any)(...args) as ReturnType<F>)
    },
  )

  wrapRenderStep = vi.fn(
    async <F extends Latitude['renderStep']>(
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
    this.withTraceContext.mockClear()
    this.wrapToolHandler.mockClear()
    this.wrapRenderChain.mockClear()
    this.wrapRenderAgent.mockClear()
    this.wrapRenderStep.mockClear()
    this.wrapRenderCompletion.mockClear()
    this.wrapRenderTool.mockClear()
  }

  mockReset() {
    this.withTraceContext.mockReset()
    this.wrapToolHandler.mockReset()
    this.wrapRenderChain.mockReset()
    this.wrapRenderAgent.mockReset()
    this.wrapRenderStep.mockReset()
    this.wrapRenderCompletion.mockReset()
    this.wrapRenderTool.mockReset()
  }

  mockRestore() {
    this.withTraceContext.mockRestore()
    this.wrapToolHandler.mockRestore()
    this.wrapRenderChain.mockRestore()
    this.wrapRenderAgent.mockRestore()
    this.wrapRenderStep.mockRestore()
    this.wrapRenderCompletion.mockRestore()
    this.wrapRenderTool.mockRestore()
  }
}
