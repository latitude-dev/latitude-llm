import Link from 'next/link'
import { ReactNode } from 'react'

import { ROUTES, BackofficeRoutes } from '$/services/routes'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Card } from '@latitude-data/web-ui/atoms/Card'
import { Icon, IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'

type Props = {
  title: string
  description: string
  actions?: ReactNode
  icon?: IconName
  breadcrumbs?: Array<{ label: string; href?: string }>
}

export function DashboardHeader({
  title,
  description,
  actions,
  icon,
  breadcrumbs,
}: Props) {
  return (
    <Card className='p-6 bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20'>
      <div className='space-y-4'>
        {/* Breadcrumbs */}
        {breadcrumbs && breadcrumbs.length > 0 && (
          <div className='flex items-center space-x-2 text-sm'>
            <Link
              href={ROUTES.backoffice[BackofficeRoutes.search].root}
              className='flex items-center space-x-1 text-primary hover:text-primary/80 transition-colors'
            >
              <Icon name='search' size='small' />
              <Text.H5 noWrap color='primary'>
                Search
              </Text.H5>
            </Link>
            {breadcrumbs.map((breadcrumb, index) => (
              <div key={index} className='flex items-center space-x-2'>
                <Icon
                  name='chevronRight'
                  size='small'
                  color='foregroundMuted'
                />
                {breadcrumb.href ? (
                  <Link
                    href={breadcrumb.href}
                    className='text-primary hover:text-primary/80 transition-colors'
                  >
                    {breadcrumb.label}
                  </Link>
                ) : (
                  <Text.H5 color='foregroundMuted'>{breadcrumb.label}</Text.H5>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Main Header Content */}
        <div className='flex items-start justify-between'>
          <div className='flex items-start space-x-4'>
            {icon && (
              <div className='p-3 bg-primary/10 rounded-lg'>
                <Icon name={icon} size='large' color='primary' />
              </div>
            )}
            <div className='flex flex-col'>
              <Text.H3>{title}</Text.H3>
              <Text.H5 color='foregroundMuted'>{description}</Text.H5>
            </div>
          </div>

          <div className='flex items-center gap-3'>
            {actions}
            <Link href={ROUTES.backoffice[BackofficeRoutes.search].root}>
              <Button
                fancy
                variant='outline'
                className='flex items-center space-x-2'
              >
                <Icon name='arrowLeft' size='small' />
                <Text.H5 noWrap>Back to Search</Text.H5>
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </Card>
  )
}
