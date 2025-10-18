'use client'

import React, { useState } from 'react'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { invalidateAppCacheAction } from '$/actions/admin/integrations/invalidateAppCache'
import { searchAppCacheKeysAction } from '$/actions/admin/integrations/searchAppCacheKeys'
import { toast } from '@latitude-data/web-ui/atoms/Toast'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@latitude-data/web-ui/atoms/Table'

export function InvalidateAppCache() {
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<string[]>([])
  const [invalidatedApps, setInvalidatedApps] = useState<
    { nameSlug: string; timestamp: Date }[]
  >([])

  const { execute: searchApps, isPending: isSearching } = useLatitudeAction(
    searchAppCacheKeysAction,
    {
      onSuccess: ({ data }) => {
        setSearchResults(data)
        if (data.length === 0) {
          toast({
            title: 'No Results',
            description: 'No cached apps found matching your search',
          })
        }
      },
      onError: (error) => {
        toast({
          title: 'Search Error',
          description: error.message || 'Failed to search cache keys',
          variant: 'destructive',
        })
      },
    },
  )

  const { execute: invalidateApp, isPending: isInvalidating } =
    useLatitudeAction(invalidateAppCacheAction, {
      onError: (error) => {
        toast({
          title: 'Error',
          description: error.message || 'Failed to invalidate app cache',
          variant: 'destructive',
        })
      },
    })

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchTerm.trim()) {
      searchApps({ searchTerm: searchTerm.trim() })
    }
  }

  const handleInvalidate = async (nameSlug: string) => {
    const [result, _error] = await invalidateApp({ nameSlug })
    if (result) {
      setInvalidatedApps((prev) => [
        { nameSlug, timestamp: new Date() },
        ...prev.slice(0, 9),
      ])
      setSearchResults((prev) => prev.filter((slug) => slug !== nameSlug))
      toast({
        title: 'Cache Invalidated',
        description: `Successfully cleared cache for "${nameSlug}". Deleted ${result.deletedCount} key(s).`,
      })
    }
  }

  return (
    <div className='space-y-4'>
      <div className='flex flex-col gap-2'>
        <Text.H4B>Invalidate Specific App Cache</Text.H4B>
        <Text.H5 color='foregroundMuted'>
          Search for a specific Pipedream app by nameSlug or display name, then
          clear its cache. This will clear both the full config and slim
          versions of the cached app data.
        </Text.H5>
      </div>

      <form onSubmit={handleSearch} className='flex gap-2'>
        <div className='flex-1'>
          <Input
            name='searchTerm'
            placeholder='Search by app nameSlug or display name (e.g., slack, github)'
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Button
          type='submit'
          disabled={isSearching || !searchTerm.trim()}
          iconProps={{ name: 'search' }}
        >
          {isSearching ? 'Searching...' : 'Search'}
        </Button>
      </form>

      {searchResults.length > 0 && (
        <div className='space-y-2'>
          <Text.H5B>Search Results ({searchResults.length})</Text.H5B>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>App Slug</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {searchResults.map((nameSlug) => (
                <TableRow key={nameSlug}>
                  <TableCell>{nameSlug}</TableCell>
                  <TableCell>
                    <Button
                      variant='ghost'
                      size='small'
                      onClick={() => handleInvalidate(nameSlug)}
                      disabled={isInvalidating}
                      iconProps={{ name: 'trash' }}
                    >
                      Clear Cache
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {invalidatedApps.length > 0 && (
        <div className='space-y-2'>
          <Text.H5B>Recently Invalidated</Text.H5B>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>App Slug</TableHead>
                <TableHead>Cleared At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invalidatedApps.map(({ nameSlug, timestamp }) => (
                <TableRow key={`${nameSlug}-${timestamp.getTime()}`}>
                  <TableCell>{nameSlug}</TableCell>
                  <TableCell>{timestamp.toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
