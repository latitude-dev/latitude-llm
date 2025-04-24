'use client'

import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import { EvaluationV2 } from '@latitude-data/core/browser'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TableWithHeader } from '@latitude-data/web-ui/molecules/ListingHeader'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { EvaluationsActions } from './EvaluationsActions'
import { EvaluationsTable } from './EvaluationsTable'
import { EvaluationsTemplates } from './EvaluationsTemplates'

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
    isLoading,
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
      {/* TODO(evalsv2):
        <div className='min-h-64 h-64 max-h-64'>
          <EvaluationsStats  />
        </div>
      */}
      <EvaluationsTable
        evaluations={evaluations}
        createEvaluation={createEvaluation}
        deleteEvaluation={deleteEvaluation}
        generateEvaluation={generateEvaluation}
        generatorEnabled={generatorEnabled}
        isLoading={isLoading}
        isCreatingEvaluation={isCreatingEvaluation}
        isDeletingEvaluation={isDeletingEvaluation}
        isGeneratingEvaluation={isGeneratingEvaluation}
      />
      <EvaluationsTemplates
        evaluations={evaluations}
        createEvaluation={createEvaluation}
        isLoading={isLoading}
        isCreatingEvaluation={isCreatingEvaluation}
      />
    </div>
  )
}
