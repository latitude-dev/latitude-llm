'use client'

import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TableWithHeader } from '@latitude-data/web-ui/molecules/ListingHeader'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { EvaluationsActions } from './EvaluationsActions'
import { EvaluationsTable } from './EvaluationsTable'
import { EvaluationV2 } from '@latitude-data/core/constants'

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
    deleteEvaluation,
    generateEvaluation,
    isCreatingEvaluation,
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
        deleteEvaluation={deleteEvaluation}
        generateEvaluation={generateEvaluation}
        generatorEnabled={generatorEnabled}
        isCreatingEvaluation={isCreatingEvaluation}
        isDeletingEvaluation={isDeletingEvaluation}
        isGeneratingEvaluation={isGeneratingEvaluation}
      />
    </div>
  )
}
