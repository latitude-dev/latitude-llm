import type { DocumentLog } from '@latitude-data/core/browser'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@latitude-data/web-ui'
import { format, formatDistanceToNow, formatRelative } from 'date-fns'

const HOURS = 1000 * 60 * 60
const DAYS = HOURS * 24
function relativeTime(date: Date | null) {
  if (date == null) return 'never'

  const now = new Date()
  const diff = now.getTime() - date.getTime()
  if (diff < 1 * HOURS) return formatDistanceToNow(date, { addSuffix: true })
  if (diff < 7 * DAYS) return formatRelative(date, new Date())
  return format(date, 'PPpp')
}

export const DocumentLogsTable = ({
  documentLogs,
}: {
  documentLogs: DocumentLog[]
}) => {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>UUID</TableHead>
          <TableHead>Commit ID</TableHead>
          <TableHead>Custom Identifier</TableHead>
          <TableHead>Created at</TableHead>
          <TableHead>Duration</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {documentLogs.map((documentLog) => (
          <TableRow key={documentLog.uuid}>
            <TableCell>
              <Text.H4>{documentLog.uuid}</Text.H4>
            </TableCell>
            <TableCell>
              <Text.H4 color='foregroundMuted'>{documentLog.commitId}</Text.H4>
            </TableCell>
            <TableCell>
              <Text.H4 color='foregroundMuted'>
                {documentLog.customIdentifier}
              </Text.H4>
            </TableCell>
            <TableCell>
              <Text.H4 color='foregroundMuted'>
                {relativeTime(documentLog.createdAt)}
              </Text.H4>
            </TableCell>
            <TableCell>
              <Text.H4 color='foregroundMuted'>{documentLog.duration}</Text.H4>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
