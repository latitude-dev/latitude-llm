'use client'

import { Issue } from '@latitude-data/core/schema/models/types/Issue'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@latitude-data/web-ui/atoms/Table'
import { TableBlankSlate } from '@latitude-data/web-ui/molecules/TableBlankSlate'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface IssuesProps {
  issues: Issue[]
  hasMore: boolean
  nextCursor: string | null
  isLoading: boolean
  projectId: number
  commitUuid: string
}

export function Issues({ issues, hasMore, nextCursor, isLoading, projectId, commitUuid }: IssuesProps) {
  const router = useRouter()

  const loadMore = () => {
    if (nextCursor) {
      const params = new URLSearchParams(window.location.search)
      params.set('cursor', nextCursor)
      router.push(`?${params.toString()}`)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Text.H6>Loading issues...</Text.H6>
      </div>
    )
  }

  if (issues.length === 0) {
    return (
      <TableBlankSlate description="No issues found. Try adjusting your filters." />
    )
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Last Seen</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {issues.map((issue) => (
            <TableRow key={issue.id}>
              <TableCell>
                <div className="flex flex-col">
                  <Text.H6>{issue.title}</Text.H6>
        <Text.P3 color="muted" className="mt-1">
          {issue.description}
        </Text.P3>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {issue.resolvedAt && (
                    <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">
                      Resolved
                    </span>
                  )}
                  {issue.ignoredAt && (
                    <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs">
                      Ignored
                    </span>
                  )}
                  {!issue.resolvedAt && !issue.ignoredAt && (
                    <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs">
                      Active
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <Text.P3 color="muted">
                  {new Date(issue.createdAt).toLocaleDateString()}
                </Text.P3>
              </TableCell>
              <TableCell>
                <Text.P3 color="muted">
                  {issue.updatedAt ? new Date(issue.updatedAt).toLocaleDateString() : '-'}
                </Text.P3>
              </TableCell>
              <TableCell>
                <div className="text-sm text-gray-500">
                  Details coming soon
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {hasMore && (
        <div className="flex justify-center pt-4">
          <Button onClick={loadMore} disabled={isLoading}>
            Load More
          </Button>
        </div>
      )}
    </div>
  )
}
