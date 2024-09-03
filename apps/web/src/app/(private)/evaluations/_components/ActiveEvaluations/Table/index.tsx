import { Evaluation } from '@latitude-data/core/browser'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@latitude-data/web-ui'
import { ROUTES } from '$/services/routes'
import { useRouter } from 'next/navigation'

export const ActiveEvaluationsTableRow = ({
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
        <Text.H4 noWrap>{evaluation.name}</Text.H4>
      </TableCell>
      <TableCell>
        <Text.H4>{evaluation.description}</Text.H4>
      </TableCell>
    </TableRow>
  )
}

export default function ActiveEvaluationsTable({
  evaluations: evaluations,
}: {
  evaluations: Evaluation[]
}) {
  const router = useRouter()

  return (
    <Table className='table-auto'>
      <TableHeader className='sticky top-0 z-10'>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Description</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className='max-h-full overflow-y-auto'>
        {evaluations.map((template) => (
          <ActiveEvaluationsTableRow
            key={template.id}
            evaluation={template}
            onSelect={() =>
              router.push(
                ROUTES.evaluations.detail({ uuid: template.uuid }).root,
              )
            }
          />
        ))}
      </TableBody>
    </Table>
  )
}
