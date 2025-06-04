import { Adapters, Chain as PromptlChain } from 'promptl-ai'

export default ({ prompt, parameters, includeSourceMap, adapterKey }) => {
  const adapter = Adapters[adapterKey]

  // TODO: Move prompt parsing from the PromptlChain constructor to the step
  // method. Constructors should be lightweight.
  const chain = new PromptlChain({
    prompt,
    parameters,
    includeSourceMap,
    adapter,
  })

  return chain.serialize()
}
