'use client'

import { ReactNode } from 'react'

import {
  Icon,
  NavTabGroup,
  NavTabItem,
  SessionUser,
  Text,
} from '@latitude-data/web-ui'
// TODO: Review dark mode before enabling
// import { ThemeButton } from '$/components/ThemeButton'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Fragment } from 'react/jsx-runtime'

import AvatarDropdown from './AvatarDropdown'

function BreadcrumpSeparator() {
  return (
    <svg
      width={12}
      height={18}
      fill='none'
      className='stroke-current text-muted-foreground'
    >
      <path
        strokeLinecap='round'
        strokeWidth={2}
        d='M1 17 11 1'
        opacity={0.5}
      />
    </svg>
  )
}

type IBreadCrumb = {
  name: string | ReactNode
}

export function Breadcrump({
  breadcrumbs,
  showLogo = false,
}: {
  breadcrumbs: IBreadCrumb[]
  showLogo?: boolean
}) {
  return (
    <ul className='flex flex-row items-center gap-x-4'>
      {showLogo ? (
        <>
          <li>
            <Icon name='logo' size='large' />
          </li>
          <li>
            <BreadcrumpSeparator />
          </li>
        </>
      ) : null}
      {breadcrumbs.map((breadcrumb, idx) => {
        const isLast = idx === breadcrumbs.length - 1
        return (
          <Fragment key={idx}>
            <li>
              {typeof breadcrumb.name === 'string' ? (
                <Text.H5 color='foregroundMuted'>
                  {breadcrumb.name as string}
                </Text.H5>
              ) : (
                breadcrumb.name
              )}
            </li>
            {!isLast ? (
              <li>
                <BreadcrumpSeparator />
              </li>
            ) : null}
          </Fragment>
        )
      })}
    </ul>
  )
}
type INavigationLink = {
  label: string
  href?: string
  index?: boolean
  onClick?: () => void
  _target?: '_blank' | '_self'
}

function NavLink({ label, href, onClick, _target }: INavigationLink) {
  return (
    <Text.H5 asChild>
      <a href={href} onClick={onClick} target={_target}>
        {label}
      </a>
    </Text.H5>
  )
}

export type AppHeaderProps = {
  navigationLinks: INavigationLink[]
  currentUser: SessionUser | undefined
  breadcrumbs?: IBreadCrumb[]
  sectionLinks?: INavigationLink[]
}
export default function AppHeader({
  breadcrumbs = [],
  sectionLinks = [],
  navigationLinks,
  currentUser,
}: AppHeaderProps) {
  const pathname = usePathname()
  return (
    <header className='px-6 sticky top-0 flex flex-col bg-background-gray border-b border-b-border'>
      <div className='py-3 flex flex-row items-center justify-between border-b border-b-border'>
        <Breadcrump showLogo breadcrumbs={breadcrumbs} />
        <div className='flex flex-row items-center gap-x-6'>
          <nav className='flex flex-row gap-x-4'>
            {navigationLinks.map((link, idx) => (
              <NavLink key={idx} {...link} />
            ))}
          </nav>
          <AvatarDropdown currentUser={currentUser} />
          {/* <ThemeButton /> Not good enough for Cesar */}
        </div>
      </div>
      {sectionLinks.length > 0 ? (
        <NavTabGroup>
          {sectionLinks.map((link, idx) => {
            let { href, label, index } = link
            href = href?.startsWith('/') ? href : `/${href}`

            const selected = href
              ? index
                ? pathname === href
                : pathname?.startsWith(href)
              : false

            if (!href) return null

            return (
              <Link href={href} key={idx}>
                <NavTabItem label={label} selected={selected} />
              </Link>
            )
          })}
        </NavTabGroup>
      ) : null}
    </header>
  )
}
