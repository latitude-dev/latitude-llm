import { parentPort } from 'node:worker_threads'
import { Chain as PromptlChain, Adapters } from 'promptl-ai'

if (parentPort) {
  parentPort.on(
    'message',
    ({ id, prompt, parameters, includeSourceMap, adapterKey }) => {
      if (!id) throw new Error('Task ID is required')
      if (!parentPort) return

      const adapter = Adapters[adapterKey]

      // TODO: Move prompt parsing from the PromptlChain constructor to the step
      // method. Constructors should be lightweight.
      const chain = new PromptlChain({
        prompt,
        parameters,
        includeSourceMap,
        adapter,
      })

      parentPort.postMessage({
        id,
        result: chain.serialize(),
      })
    },
  )
}
