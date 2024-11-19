'use client'

import {
  Evaluation,
  EvaluationMetadataType,
  EvaluationResultableType,
} from '@latitude-data/core/browser'
import {
  Icon,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@latitude-data/web-ui'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'

export const evaluationMetadataTypes = {
  [EvaluationMetadataType.LlmAsJudgeSimple]: 'LLM as judge',
  [EvaluationMetadataType.LlmAsJudgeAdvanced]: 'LLM as judge',
  [EvaluationMetadataType.Manual]: 'Code / Manual',
}

export const evaluationResultTypes = {
  [EvaluationResultableType.Boolean]: 'Boolean',
  [EvaluationResultableType.Number]: 'Number',
  [EvaluationResultableType.Text]: 'Text',
}

const ActiveEvaluationsTableRow = ({
  evaluation,
  onSelect,
}: {
  evaluation: Evaluation
  onSelect: () => void
}) => {
  return (
    <TableRow
      key={evaluation.id}
      className='cursor-pointer border-b-[0.5px] h-12 max-h-12 border-border'
      onClick={onSelect}
    >
      <TableCell>
        <Text.H5 noWrap>{evaluation.name}</Text.H5>
      </TableCell>
      <TableCell>
        <Text.H5>{evaluation.description || '-'}</Text.H5>
      </TableCell>
      <TableCell>
        <Text.H5>{evaluationMetadataTypes[evaluation.metadataType]}</Text.H5>
      </TableCell>
      <TableCell>
        <Text.H5>{evaluationResultTypes[evaluation.resultType!]}</Text.H5>
      </TableCell>
      <TableCell>
        <Link
          href={ROUTES.evaluations.destroy(evaluation.uuid)}
          onClick={(e) => e.stopPropagation()}
        >
          <Icon name='trash' />
        </Link>
      </TableCell>
    </TableRow>
  )
}

export default function ActiveEvaluationsTable({
  evaluations: evaluations,
}: {
  evaluations: Evaluation[]
}) {
  const navigate = useNavigate()
  return (
    <Table className='table-auto'>
      <TableHeader className='sticky top-0 z-10'>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Result Type</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className='max-h-full overflow-y-auto'>
        {evaluations.map((template) => (
          <ActiveEvaluationsTableRow
            key={template.id}
            evaluation={template}
            onSelect={() =>
              navigate.push(
                ROUTES.evaluations.detail({ uuid: template.uuid }).root,
              )
            }
          />
        ))}
      </TableBody>
    </Table>
  )
}
