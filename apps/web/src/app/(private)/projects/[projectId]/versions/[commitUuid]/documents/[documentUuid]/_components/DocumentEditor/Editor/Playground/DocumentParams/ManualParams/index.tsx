import { useDocumentParameters } from '$/hooks/useDocumentParameters'

import { Props } from '../index'
import { InputParams } from '../Input'

export function ManualParams({ document, commitVersionUuid }: Props) {
  const {
    manual: { inputs, setInput },
  } = useDocumentParameters({
    documentVersionUuid: document.documentUuid,
    commitVersionUuid,
  })
  return <InputParams inputs={inputs} setInput={setInput} />
}
