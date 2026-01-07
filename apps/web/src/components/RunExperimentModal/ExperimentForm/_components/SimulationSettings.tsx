import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { SimulationSettingsPanel } from '$/components/SimulationSettings'
import useDocumentRecursiveTools from '$/stores/documentRecursiveTools'
import { SimulationSettings } from '@latitude-data/constants/simulation'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useCallback } from 'react'
import { ExperimentFormPayload } from '../useExperimentFormPayload'

export function ExperimentSimulationSettings(payload: ExperimentFormPayload) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()

  const { data: toolManifestDict, isLoading } = useDocumentRecursiveTools(
    {
      projectId: project.id,
      commitUuid: commit.uuid,
      documentUuid: document.documentUuid,
    },
    {
      revalidateOnMount: true,
    },
  )

  const { simulationSettings, setSimulationSettings } = payload

  const handleChange = useCallback(
    (settings: SimulationSettings) => {
      setSimulationSettings(settings)
    },
    [setSimulationSettings],
  )

  if (!isLoading && Object.keys(toolManifestDict ?? {}).length === 0) {
    return (
      <Text.H6 color='foregroundMuted'>
        There are no tools to simulate in this prompt.
      </Text.H6>
    )
  }

  return (
    <div className='flex flex-col gap-4 w-2/3'>
      <SimulationSettingsPanel
        value={simulationSettings}
        onChange={handleChange}
      />
    </div>
  )
}
