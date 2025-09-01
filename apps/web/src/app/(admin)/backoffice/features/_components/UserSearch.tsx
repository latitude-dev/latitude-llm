'use client'

import React, { useState } from 'react'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@latitude-data/web-ui/atoms/Table'

type UserSearchResult = {
  id: string
  email: string
  workspaces: {
    id: number
    name: string
  }[]
}

export function UserSearch() {
  const [emails, setEmails] = useState('')
  const [results, setResults] = useState<UserSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState('')

  const handleSearch = async () => {
    if (!emails.trim()) {
      setError('Please enter at least one email address.')
      return
    }

    setIsSearching(true)
    setError('')

    try {
      // Parse emails from textarea (split by newlines, commas, or spaces)
      const emailList = emails
        .split(/[\n,\s]+/)
        .map((email) => email.trim())
        .filter((email) => email.length > 0)

      const response = await fetch('/api/admin/users/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ emails: emailList }),
      })

      if (!response.ok) {
        throw new Error('Failed to search users')
      }

      const data = await response.json()
      setResults(data.users)
    } catch (err) {
      setError('Failed to search users. Please try again.')
      console.error('Search error:', err)
    } finally {
      setIsSearching(false)
    }
  }

  return (
    <div className='flex flex-col gap-y-6'>
      <div className='flex flex-col gap-y-4'>
        <Text.H3>User Search</Text.H3>
        <Text.H5 color='foregroundMuted'>
          Enter email addresses to search for users and their workspaces. You
          can enter multiple emails separated by commas, spaces, or new lines.
        </Text.H5>

        <div className='flex flex-col gap-y-2'>
          <TextArea
            placeholder='Enter email addresses (one per line or separated by commas)...'
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            rows={6}
            className='min-h-[120px]'
          />
          <Button
            onClick={handleSearch}
            disabled={isSearching || !emails.trim()}
            className='w-fit'
          >
            {isSearching ? 'Searching...' : 'Search Users'}
          </Button>
        </div>

        {error && <Text.H5 color='destructive'>{error}</Text.H5>}
      </div>

      {results.length > 0 && (
        <div className='flex flex-col gap-y-4'>
          <Text.H4>Search Results ({results.length} users found)</Text.H4>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>USER_ID</TableHead>
                <TableHead>EMAIL</TableHead>
                <TableHead>WORKSPACES</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className='font-mono text-xs py-4'>
                    {user.id}
                  </TableCell>
                  <TableCell className='py-4'>{user.email}</TableCell>
                  <TableCell className='py-4'>
                    {user.workspaces.length > 0 ? (
                      <div className='flex flex-col gap-y-2'>
                        {user.workspaces.map((workspace) => (
                          <div
                            key={workspace.id}
                            className='flex items-center gap-x-3 text-sm p-2 bg-muted rounded-md'
                          >
                            <span className='font-mono text-xs text-muted-foreground min-w-fit'>
                              {workspace.id}
                            </span>
                            <span className='flex-1'>{workspace.name}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Text.H6 color='foregroundMuted'>No workspaces</Text.H6>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {results.length === 0 && emails.trim() && !isSearching && !error && (
        <Text.H5 color='foregroundMuted'>
          No users found for the provided email addresses.
        </Text.H5>
      )}
    </div>
  )
}
