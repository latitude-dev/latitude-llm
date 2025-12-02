'use client'

import { DeploymentTest } from '@latitude-data/core/schema/models/types/DeploymentTest'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@latitude-data/web-ui/atoms/Table'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { formatDistanceToNow } from 'date-fns'

const STATUS_COLORS: Record<string, string> = {
  pending: 'yellow',
  running: 'blue',
  paused: 'orange',
  completed: 'green',
  cancelled: 'red',
}

const TEST_TYPE_LABELS: Record<string, string> = {
  shadow: '🌑 Shadow Test',
  ab: '🔀 A/B Test',
}

export function TestsList({ tests }: { tests: DeploymentTest[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tests.map((test) => (
          <TableRow key={test.id}>
            <TableCell>
              <Text.H7 weight='medium'>{test.name}</Text.H7>
            </TableCell>
            <TableCell>
              <Text.H7>{TEST_TYPE_LABELS[test.testType]}</Text.H7>
            </TableCell>
            <TableCell>
              <Badge color={STATUS_COLORS[test.status] as any}>
                {test.status}
              </Badge>
            </TableCell>
            <TableCell>
              <Text.H7>
                {formatDistanceToNow(new Date(test.createdAt), {
                  addSuffix: true,
                })}
              </Text.H7>
            </TableCell>
            <TableCell>{/* Actions will be added later */}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
