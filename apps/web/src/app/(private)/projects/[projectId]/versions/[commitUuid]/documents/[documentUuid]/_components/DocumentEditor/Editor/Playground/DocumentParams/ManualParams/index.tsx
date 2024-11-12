import {
  PlaygroundInput,
  PlaygroundInputs,
} from '$/hooks/useDocumentParameters'

import { InputParams } from '../Input'

export function ManualParams({
  inputs,
  setInput,
}: {
  inputs: PlaygroundInputs
  setInput: (param: string, value: PlaygroundInput) => void
}) {
  return <InputParams inputs={inputs} setInput={setInput} />
}
