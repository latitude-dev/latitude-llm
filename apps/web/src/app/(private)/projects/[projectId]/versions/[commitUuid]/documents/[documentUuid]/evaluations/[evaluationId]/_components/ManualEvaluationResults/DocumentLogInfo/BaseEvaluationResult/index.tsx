import { FormEvent, ReactNode, useState } from 'react'

import {
  EvaluationDto,
  EvaluationResultableType,
  EvaluationResultDto,
} from '@latitude-data/core/browser'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { FormField } from '@latitude-data/web-ui/atoms/FormField'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useDocumentLogsWithEvaluationResults } from '$/stores/documentLogsWithEvaluationResults'
import useEvaluationResults from '$/stores/evaluationResults'
import { useSearchParams } from 'next/navigation'

import { DocumentLogWithMetadataAndErrorAndEvaluationResult } from '../..'

interface BaseEvaluationResultProps {
  documentLog: DocumentLogWithMetadataAndErrorAndEvaluationResult
  evaluation: EvaluationDto
  result?: EvaluationResultDto
  children: ReactNode
  type: EvaluationResultableType
  value: any
  showReasonInput?: boolean
}

export function BaseEvaluationResult({
  documentLog,
  evaluation,
  result,
  children,
  type,
  value,
  showReasonInput = true,
}: BaseEvaluationResultProps) {
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const { document } = useCurrentDocument()
  const searchParams = useSearchParams()
  const page = searchParams.get('page')
  const pageSize = searchParams.get('pageSize')

  const { mutate } = useDocumentLogsWithEvaluationResults({
    evaluationId: evaluation.id,
    documentUuid: document.documentUuid,
    commitUuid: commit.uuid,
    projectId: project.id,
    page,
    pageSize,
  })
  const { create, update } = useEvaluationResults()
  const [reason, setReason] = useState(result?.reason ?? '')

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (result) {
      await update({
        id: result.id,
        value,
        reason,
      })
    } else {
      await create({
        evaluationId: evaluation.id,
        documentLogId: documentLog.id,
        type,
        value,
        reason,
      })
    }

    mutate()
  }

  return (
    <div className='border-t p-4 flex flex-col gap-y-2'>
      <Text.H6M>Rate this response</Text.H6M>
      <form onSubmit={handleSubmit}>
        <FormWrapper>
          <FormField>{children}</FormField>
          {showReasonInput && value !== undefined && (
            <>
              <TextArea
                label='reason'
                name='reason'
                placeholder='Provide a reason for your rating (optional)'
                onChange={(e) => setReason(e.target.value)}
                defaultValue={result?.reason || undefined}
                minRows={1}
              />
              <FormField>
                <div className='flex justify-end'>
                  <Button fancy type='submit'>
                    Submit
                  </Button>
                </div>
              </FormField>
            </>
          )}
        </FormWrapper>
      </form>
    </div>
  )
}
