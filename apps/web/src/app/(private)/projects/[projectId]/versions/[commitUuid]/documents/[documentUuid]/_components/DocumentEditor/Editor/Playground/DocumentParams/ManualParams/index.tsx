import { useDocumentParameters } from '$/hooks/useDocumentParameters'

import { Props } from '../index'
import { InputParams } from '../Input'

export function ManualParams({ document, commit, prompt, setPrompt }: Props) {
  const {
    manual: { inputs, setInput },
  } = useDocumentParameters({
    documentVersionUuid: document.documentUuid,
    commitVersionUuid: commit.uuid,
  })
  return (
    <InputParams
      inputs={inputs}
      setInput={setInput}
      commit={commit}
      prompt={prompt}
      setPrompt={setPrompt}
    />
  )
}
