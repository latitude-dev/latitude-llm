import { Evaluation } from '@latitude-data/core/browser'
import {
  Icons,
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
      <TableCell onClick={(e) => e.stopPropagation()}>
        <Link
          href={
            ROUTES.evaluations.detail({ uuid: evaluation.uuid }).dashboard
              .destroy.root
          }
        >
          <Icons.trash />
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
