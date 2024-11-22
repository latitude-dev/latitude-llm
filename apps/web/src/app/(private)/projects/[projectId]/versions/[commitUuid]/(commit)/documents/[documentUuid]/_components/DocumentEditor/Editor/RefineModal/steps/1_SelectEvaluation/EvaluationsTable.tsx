import { useCallback, useState } from 'react'

import { EvaluationDto } from '@latitude-data/core/browser'
import {
  cn,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
  useCurrentCommit,
} from '@latitude-data/web-ui'
import EvaluationAggregatedResult from '$/components/EvaluationAggregatedResult'

export default function EvaluationsTable({
  documentUuid,
  evaluations,
  onSelect,
}: {
  documentUuid: string
  evaluations: EvaluationDto[]
  onSelect: (evaluation: EvaluationDto) => void
}) {
  const [selectedEvaluation, setSelectedEvaluation] = useState<EvaluationDto>()

  const handleSelect = useCallback(
    (evaluation: EvaluationDto) => {
      setSelectedEvaluation(evaluation)
      onSelect(evaluation)
    },
    [onSelect],
  )

  const { commit } = useCurrentCommit()

  return (
    <Table className='table-auto'>
      <TableHeader className='sticky top-0 z-10'>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Aggregated Value</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className='max-h-full overflow-y-auto'>
        {evaluations.map((evaluation) => (
          <TableRow
            key={evaluation.id}
            className={cn(
              'cursor-pointer border-b-[0.5px] h-12 max-h-12 border-border',
              {
                'bg-secondary hover:bg-secondary/50':
                  selectedEvaluation?.id === evaluation.id,
              },
            )}
            onClick={() => handleSelect(evaluation)}
          >
            <TableCell>
              <Text.H5 noWrap>{evaluation.name}</Text.H5>
            </TableCell>
            <TableCell>
              <Text.H5 ellipsis>{evaluation.description}</Text.H5>
            </TableCell>
            <TableCell>
              <div className='flex w-full items-center justify-center'>
                <EvaluationAggregatedResult
                  evaluation={evaluation}
                  documentUuid={documentUuid}
                  commitUuid={commit.uuid}
                />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
