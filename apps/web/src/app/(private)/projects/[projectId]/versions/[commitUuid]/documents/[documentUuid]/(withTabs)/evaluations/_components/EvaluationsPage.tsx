'use client'

import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import { EvaluationV2 } from '@latitude-data/core/constants'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TableWithHeader } from '@latitude-data/web-ui/molecules/ListingHeader'
import { EvaluationsActions } from './EvaluationsActions'
import { EvaluationsTable } from './EvaluationsTable'

export function EvaluationsPage({
  evaluations: serverEvaluations,
  generatorEnabled,
}: {
  evaluations: EvaluationV2[]
  generatorEnabled: boolean
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()

  const {
    data: evaluations,
    createEvaluation,
    updateEvaluation,
    deleteEvaluation,
    generateEvaluation,
    isCreatingEvaluation,
    isUpdatingEvaluation,
    isDeletingEvaluation,
    isGeneratingEvaluation,
  } = useEvaluationsV2(
    { project, commit, document },
    { fallbackData: serverEvaluations },
  )

  return (
    <div className='w-full flex flex-col gap-4 p-6'>
      <TableWithHeader
        title={
          <Text.H4M noWrap ellipsis>
            Evaluations
          </Text.H4M>
        }
        actions={
          <EvaluationsActions
            createEvaluation={createEvaluation}
            generateEvaluation={generateEvaluation}
            generatorEnabled={generatorEnabled}
            isCreatingEvaluation={isCreatingEvaluation}
            isGeneratingEvaluation={isGeneratingEvaluation}
          />
        }
      />
      <EvaluationsTable
        evaluations={evaluations}
        createEvaluation={createEvaluation}
        updateEvaluation={updateEvaluation}
        deleteEvaluation={deleteEvaluation}
        generateEvaluation={generateEvaluation}
        generatorEnabled={generatorEnabled}
        isCreatingEvaluation={isCreatingEvaluation}
        isUpdatingEvaluation={isUpdatingEvaluation}
        isDeletingEvaluation={isDeletingEvaluation}
        isGeneratingEvaluation={isGeneratingEvaluation}
      />
    </div>
  )
}
