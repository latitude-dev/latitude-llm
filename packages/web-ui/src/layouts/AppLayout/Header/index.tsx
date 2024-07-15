import { ReactNode } from 'react'

import { Avatar } from '$ui/ds/atoms/Avatar'
import { Icons } from '$ui/ds/atoms/Icons'
import Text from '$ui/ds/atoms/Text'
import getUserInfoFromSession from '$ui/lib/getUserInfo'
import { SessionUser } from '$ui/providers'
import { Fragment } from 'react/jsx-runtime'

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

type IBreadCrumb = { name: string | ReactNode }
function Breadcrump({ breadcrumbs }: { breadcrumbs: IBreadCrumb[] }) {
  return (
    <ul className='flex flex-row items-center gap-x-4'>
      <li>
        <Icons.logo className='w-6 h-6' />
      </li>
      {breadcrumbs.length === 0 ? null : (
        <li>
          <BreadcrumpSeparator />
        </li>
      )}
      {breadcrumbs.map((breadcrumb, idx) => {
        const isLast = idx === breadcrumbs.length - 1
        return (
          <Fragment key={idx}>
            <li>
              {typeof breadcrumb.name === 'string' ? (
                <Text.H5M>{breadcrumb.name as string}</Text.H5M>
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
}
export default function AppHeader({
  breadcrumbs = [],
  navigationLinks,
  currentUser,
}: AppHeaderProps) {
  const info = currentUser ? getUserInfoFromSession(currentUser) : null
  return (
    <header className='sticky top-0 px-6 py-3 flex flex-row items-center justify-between border-b border-b-border'>
      <Breadcrump breadcrumbs={breadcrumbs} />
      <div className='flex flex-row items-center gap-x-6'>
        <nav className='flex flex-row gap-x-2'>
          {navigationLinks.map((link, idx) => (
            <NavLink key={idx} {...link} />
          ))}
        </nav>
        {info ? (
          <Avatar
            alt={info.name}
            fallback={info.fallback}
            className='w-6 h-6'
          />
        ) : null}
      </div>
    </header>
  )
}
