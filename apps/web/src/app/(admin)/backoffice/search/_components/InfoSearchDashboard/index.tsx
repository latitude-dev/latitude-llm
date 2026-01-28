'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'

import { BackofficeRoutes, ROUTES } from '$/services/routes'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Card } from '@latitude-data/web-ui/atoms/Card'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Text } from '@latitude-data/web-ui/atoms/Text'

import { useUnifiedSearch, EntityType } from '../../_hooks/useUnifiedSearch'
import {
  useRecentSearches,
  RecentSearchItem,
} from '../../_hooks/useRecentSearches'

function getEntityRoute(
  type: 'user' | 'workspace' | 'project',
  id: string | number,
) {
  if (type === 'user') {
    return ROUTES.backoffice[BackofficeRoutes.search].user(id as string)
  } else if (type === 'workspace') {
    return ROUTES.backoffice[BackofficeRoutes.search].workspace(id as number)
  } else {
    return ROUTES.backoffice[BackofficeRoutes.search].project(id as number)
  }
}

const ENTITY_TABS: { value: EntityType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'user', label: 'Users' },
  { value: 'workspace', label: 'Workspaces' },
  { value: 'project', label: 'Projects' },
]

function EntityIcon({
  type,
  size = 'small',
}: {
  type: 'user' | 'workspace' | 'project'
  size?: 'small' | 'normal'
}) {
  const iconName =
    type === 'user'
      ? 'circleUser'
      : type === 'workspace'
        ? 'house'
        : 'folderOpen'
  const bgColor =
    type === 'user'
      ? 'bg-blue-100 dark:bg-blue-900/30'
      : type === 'workspace'
        ? 'bg-green-100 dark:bg-green-900/30'
        : 'bg-purple-100 dark:bg-purple-900/30'

  return (
    <div className={`p-2 ${bgColor} rounded-lg`}>
      <Icon name={iconName} size={size} color='foreground' />
    </div>
  )
}

function isValidEmail(value: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(value.trim())
}

function isValidNumericId(value: string): boolean {
  const numericId = parseInt(value.trim())
  return !isNaN(numericId) && numericId > 0
}

function QuickJumpSection({
  query,
  entityType,
}: {
  query: string
  entityType: EntityType
}) {
  const trimmedQuery = query.trim()
  const numericId = parseInt(trimmedQuery)
  const hasValidId = isValidNumericId(trimmedQuery)
  const hasValidEmail = isValidEmail(trimmedQuery)

  const showUser =
    hasValidEmail && (entityType === 'all' || entityType === 'user')
  const showWorkspace =
    hasValidId && (entityType === 'all' || entityType === 'workspace')
  const showProject =
    hasValidId && (entityType === 'all' || entityType === 'project')

  if (!showUser && !showWorkspace && !showProject) return null

  return (
    <div className='flex flex-col gap-2'>
      <Text.H6 color='foregroundMuted'>Quick Jump</Text.H6>
      <div className='flex flex-row flex-wrap gap-2'>
        {showUser && (
          <Link href={getEntityRoute('user', trimmedQuery)}>
            <Button variant='outline' size='small'>
              <div className='flex flex-row items-center gap-2'>
                <Icon name='circleUser' size='small' />
                <Text.H6>Go to User {trimmedQuery}</Text.H6>
              </div>
            </Button>
          </Link>
        )}
        {showWorkspace && (
          <Link href={getEntityRoute('workspace', numericId)}>
            <Button variant='outline' size='small'>
              <div className='flex flex-row items-center gap-2'>
                <Icon name='house' size='small' />
                <Text.H6>Go to Workspace #{numericId}</Text.H6>
              </div>
            </Button>
          </Link>
        )}
        {showProject && (
          <Link href={getEntityRoute('project', numericId)}>
            <Button variant='outline' size='small'>
              <div className='flex flex-row items-center gap-2'>
                <Icon name='folderOpen' size='small' />
                <Text.H6>Go to Project #{numericId}</Text.H6>
              </div>
            </Button>
          </Link>
        )}
      </div>
    </div>
  )
}

function RecentSection({
  items,
  entityType,
  onClear,
}: {
  items: RecentSearchItem[]
  entityType: EntityType
  onClear: () => void
}) {
  const filteredItems =
    entityType === 'all'
      ? items
      : items.filter((item) => item.type === entityType)

  if (filteredItems.length === 0) {
    return (
      <div className='py-12 flex flex-col items-center justify-center gap-4'>
        <Icon
          name='clock'
          size='xlarge'
          color='foregroundMuted'
          className='opacity-50'
        />
        <div className='flex flex-col items-center gap-1'>
          <Text.H4 color='foregroundMuted'>No recent searches</Text.H4>
          <Text.H5 color='foregroundMuted'>
            Your recently viewed items will appear here
          </Text.H5>
        </div>
      </div>
    )
  }

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex flex-row items-center justify-between'>
        <Text.H5 color='foregroundMuted'>Recent</Text.H5>
        <Button variant='ghost' size='small' onClick={onClear}>
          Clear all
        </Button>
      </div>
      <div className='flex flex-col gap-1'>
        {filteredItems.map((item) => (
          <Link
            key={`${item.type}-${item.id}`}
            href={getEntityRoute(item.type, item.id)}
            className='w-full flex flex-row items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors'
          >
            <EntityIcon type={item.type} />
            <div className='flex-1 min-w-0 flex flex-row items-center gap-2'>
              <Text.H5 noWrap ellipsis>
                {item.label}
              </Text.H5>
              {item.sublabel && (
                <Text.H6 color='foregroundMuted' noWrap ellipsis>
                  {item.sublabel}
                </Text.H6>
              )}
            </div>
            <Text.H6 color='foregroundMuted'>
              {formatDistanceToNow(item.visitedAt, { addSuffix: true })}
            </Text.H6>
          </Link>
        ))}
      </div>
    </div>
  )
}

function SearchResultItem({
  type,
  id,
  text,
  detail,
}: {
  type: 'user' | 'workspace' | 'project'
  id: string | number
  text: string
  detail?: string
}) {
  return (
    <Link
      href={getEntityRoute(type, id)}
      className='w-full flex flex-row items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors'
    >
      <EntityIcon type={type} />
      <div className='flex-grow min-w-0 flex flex-row items-center gap-2'>
        <Text.H5 noWrap ellipsis>
          {text}
        </Text.H5>
        {detail && <Text.H6 color='foregroundMuted'>{detail}</Text.H6>}
      </div>
    </Link>
  )
}

function SearchResults({
  results,
  entityType,
  isLoading,
  isQueryTooShort,
}: {
  results: ReturnType<typeof useUnifiedSearch>['results']
  entityType: EntityType
  isLoading: boolean
  isQueryTooShort: boolean
}) {
  if (isQueryTooShort) {
    return (
      <div className='py-8 flex flex-col items-center justify-center gap-4'>
        <Icon
          name='text'
          size='xlarge'
          color='foregroundMuted'
          className='opacity-50'
        />
        <div className='flex flex-col items-center gap-1'>
          <Text.H5 color='foregroundMuted'>
            Type at least 2 characters to search
          </Text.H5>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className='py-8 flex flex-col items-center justify-center gap-4'>
        <Icon
          name='loader'
          size='xlarge'
          color='foregroundMuted'
          className='animate-spin'
        />
        <Text.H5 color='foregroundMuted'>Searching...</Text.H5>
      </div>
    )
  }

  const hasResults =
    results.users.length > 0 ||
    results.workspaces.length > 0 ||
    results.projects.length > 0

  if (!hasResults) {
    return (
      <div className='py-8 flex flex-col items-center justify-center gap-4'>
        <Icon
          name='search'
          size='xlarge'
          color='foregroundMuted'
          className='opacity-50'
        />
        <div className='flex flex-col items-center gap-1'>
          <Text.H4 color='foregroundMuted'>No results found</Text.H4>
          <Text.H5 color='foregroundMuted'>
            Try a different search term or filter
          </Text.H5>
        </div>
      </div>
    )
  }

  return (
    <div className='flex flex-col gap-6'>
      {(entityType === 'all' || entityType === 'user') &&
        results.users.length > 0 && (
          <div className='flex flex-col gap-2'>
            <Text.H5 color='foregroundMuted'>
              Users ({results.users.length})
            </Text.H5>
            <div className='flex flex-col gap-1'>
              {results.users.map((user) => (
                <SearchResultItem
                  key={user.id}
                  type='user'
                  id={user.email}
                  text={user.email}
                  detail={user.name || undefined}
                />
              ))}
            </div>
          </div>
        )}

      {(entityType === 'all' || entityType === 'workspace') &&
        results.workspaces.length > 0 && (
          <div className='flex flex-col gap-2'>
            <Text.H5 color='foregroundMuted'>
              Workspaces ({results.workspaces.length})
            </Text.H5>
            <div className='flex flex-col gap-1'>
              {results.workspaces.map((workspace) => (
                <SearchResultItem
                  key={workspace.id}
                  type='workspace'
                  id={workspace.id}
                  text={workspace.name}
                  detail={`#${workspace.id}`}
                />
              ))}
            </div>
          </div>
        )}

      {(entityType === 'all' || entityType === 'project') &&
        results.projects.length > 0 && (
          <div className='flex flex-col gap-2'>
            <Text.H5 color='foregroundMuted'>
              Projects ({results.projects.length})
            </Text.H5>
            <div className='flex flex-col gap-1'>
              {results.projects.map((project) => (
                <SearchResultItem
                  key={project.id}
                  type='project'
                  id={project.id}
                  text={project.name}
                  detail={`#${project.id}`}
                />
              ))}
            </div>
          </div>
        )}
    </div>
  )
}

export function InfoSearchDashboard() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [entityType, setEntityType] = useState<EntityType>('all')

  const { results, isLoading, isQueryTooShort } = useUnifiedSearch(
    query,
    entityType,
  )
  const { recentItems, clearRecentItems } = useRecentSearches()

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        setQuery('')
        inputRef.current?.blur()
      }
    },
    [],
  )

  const showRecent = !query.trim()

  return (
    <div className='container mx-auto p-6 max-w-3xl'>
      <div className='flex flex-col gap-6'>
        <div className='flex flex-col gap-2'>
          <Text.H1>Admin Search</Text.H1>
          <Text.H4 color='foregroundMuted'>
            Find users, workspaces, and projects
          </Text.H4>
        </div>

        <Card className='p-6'>
          <div className='flex flex-col gap-4'>
            <div className='relative'>
              <Icon
                name='search'
                size='normal'
                className='absolute left-3 top-1/2 transform -translate-y-1/2 z-10'
                color='foregroundMuted'
              />
              <Input
                ref={inputRef}
                type='text'
                placeholder='Search by name, email, or ID...'
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                className='pl-10 text-lg'
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className='absolute right-3 top-1/2 transform -translate-y-1/2 p-1 hover:bg-muted rounded'
                >
                  <Icon name='close' size='small' color='foregroundMuted' />
                </button>
              )}
            </div>

            <div className='flex flex-row gap-1 border-b border-border pb-2'>
              {ENTITY_TABS.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setEntityType(tab.value)}
                  className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
                    entityType === tab.value
                      ? 'bg-primary text-primary-foreground'
                      : 'text-foreground/60 hover:text-foreground hover:bg-muted'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className='min-h-[300px] flex flex-col gap-4'>
              {!showRecent && (
                <QuickJumpSection query={query} entityType={entityType} />
              )}
              {showRecent ? (
                <RecentSection
                  items={recentItems}
                  entityType={entityType}
                  onClear={clearRecentItems}
                />
              ) : (
                <SearchResults
                  results={results}
                  entityType={entityType}
                  isLoading={isLoading}
                  isQueryTooShort={isQueryTooShort}
                />
              )}
            </div>
          </div>
        </Card>

        <Card className='p-4 bg-muted/30 border-dashed'>
          <div className='flex flex-row items-start gap-3'>
            <Icon name='lightBulb' size='normal' color='foregroundMuted' />
            <div className='flex flex-col gap-1'>
              <Text.H5 color='foregroundMuted'>
                <strong>Tip:</strong> Enter an email to jump directly to a user,
                or a numeric ID for workspaces and projects
              </Text.H5>
              <Text.H6 color='foregroundMuted'>
                Press Escape to clear the search
              </Text.H6>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
