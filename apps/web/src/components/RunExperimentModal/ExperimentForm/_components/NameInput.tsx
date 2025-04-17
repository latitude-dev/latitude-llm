import { useEffect } from 'react'
import { ExperimentFormPayload } from '../useExperimentFormPayload'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { randomExperimentName } from './randomExperimentName'

export function ExperimentNameInput({ name, setName }: ExperimentFormPayload) {
  useEffect(() => {
    setName(randomExperimentName())
  }, [])

  return <Input value={name} onChange={(e) => setName(e.target.value)} />
}
