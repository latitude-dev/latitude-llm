import {
  forwardRef,
  HTMLAttributes,
  ReactNode,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from 'react'

import { cn } from '../../../lib/utils'
import { Icon } from '../Icons'
import { Text } from '../Text'
import { Tooltip } from '../Tooltip'

type TableProps = HTMLAttributes<HTMLTableElement> & {
  maxHeight?: number | string
  overflow?: 'overflow-auto' | 'overflow-hidden'
  externalFooter?: ReactNode
  wrapperClassName?: string
}
const Table = forwardRef<HTMLTableElement, TableProps>(
  (
    {
      className,
      wrapperClassName,
      maxHeight,
      externalFooter,
      overflow = 'overflow-auto',
      ...props
    },
    ref,
  ) => (
    <div
      style={{
        maxHeight:
          maxHeight && typeof maxHeight === 'number'
            ? `${maxHeight}px`
            : 'unset',
      }}
      className={cn(
        'flex flex-col relative w-full rounded-xl border overflow-hidden',
        wrapperClassName,
      )}
    >
      <div
        className={cn('relative w-full flex-grow', overflow, {
          'custom-scrollbar min-w-full': overflow === 'overflow-auto',
        })}
      >
        <table
          ref={ref}
          className={cn('w-max min-w-full caption-bottom text-sm', className)}
          {...props}
        />
      </div>
      {externalFooter ? (
        <div className='border-t bg-secondary w-full py-2 px-4'>
          {externalFooter}
        </div>
      ) : null}
    </div>
  ),
)
Table.displayName = 'Table'

const TableHeader = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn('[&_tr]:border-b', className)} {...props} />
))
TableHeader.displayName = 'TableHeader'

const TableBody = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn('[&_tr:last-child]:border-0', className)}
    {...props}
  />
))
TableBody.displayName = 'TableBody'

type TableFooterProps = HTMLAttributes<HTMLTableSectionElement> & {
  sticky?: boolean
}
const TableFooter = forwardRef<HTMLTableSectionElement, TableFooterProps>(
  ({ className, sticky = false, ...props }, ref) => (
    <tfoot
      ref={ref}
      className={cn(
        'border-t bg-secondary font-medium [&>tr]:last:border-b-0',
        className,
        {
          'sticky bottom-0': sticky,
        },
      )}
      {...props}
    />
  ),
)
TableFooter.displayName = 'TableFooter'

const TableRow = forwardRef<
  HTMLTableRowElement,
  HTMLAttributes<HTMLTableRowElement> & {
    verticalPadding?: boolean
    hoverable?: boolean
    borderBottom?: boolean
  }
>(
  (
    {
      className,
      verticalPadding,
      borderBottom = true,
      hoverable = true,
      ...props
    },
    ref,
  ) => (
    <tr
      ref={ref}
      className={cn(
        'transition-colors data-[state=selected]:bg-secondary',
        {
          '[&>td]:py-4': verticalPadding,
          'hover:bg-secondary': hoverable,
          'border-b': borderBottom,
        },
        className,
      )}
      {...props}
    />
  ),
)
TableRow.displayName = 'TableRow'

type THeadProps = ThHTMLAttributes<HTMLTableCellElement> & {
  tooltipMessage?: string
  verticalBorder?: boolean
}
const TableHead = forwardRef<HTMLTableCellElement, THeadProps>(
  ({ className, tooltipMessage, verticalBorder = false, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        'h-10 px-4 text-left align-middle font-medium bg-secondary [&:has([role=checkbox])]:pr-0',
        className,
        {
          'border-r last:border-r-0': verticalBorder,
        },
      )}
      {...props}
    >
      <div
        className={cn('flex items-center w-full', {
          'justify-start': props.align === 'left',
          'justify-center': props.align === 'center',
          'justify-end': props.align === 'right',
        })}
      >
        {tooltipMessage ? (
          <Tooltip
            trigger={
              <div className='flex flex-row gap-x-1 items-center'>
                <Icon name='info' />
                <Text.H5M noWrap>{props.children}</Text.H5M>
              </div>
            }
          >
            {tooltipMessage}
          </Tooltip>
        ) : typeof props.children === 'string' ? (
          <Text.H5M noWrap>{props.children}</Text.H5M>
        ) : (
          props.children
        )}
      </div>
    </th>
  ),
)
TableHead.displayName = 'TableHead'

type CommonCellProps = TdHTMLAttributes<HTMLTableCellElement> & {
  align?: 'left' | 'center' | 'right'
  xSpace?: 'none' | 'small' | 'normal'
  verticalBorder?: boolean
  innerClassName?: string
}

const ServerSideTableCell = forwardRef<HTMLTableCellElement, CommonCellProps>(
  (
    {
      className,
      children,
      align = 'left',
      xSpace = 'normal',
      verticalBorder = false,
      innerClassName,
      ...props
    },
    ref,
  ) => (
    <td
      ref={ref}
      className={cn(
        'px-4 align-middle [&:has([role=checkbox])]:pr-0',
        'max-w-60',
        {
          'px-4': xSpace === 'normal',
          'px-2': xSpace === 'small',
          'px-0': xSpace === 'none',
          'border-r last:border-r-0': verticalBorder,
        },
        className,
      )}
      {...props}
    >
      <div
        className={cn(innerClassName, 'flex', {
          'justify-start': align === 'left',
          'justify-center': align === 'center',
          'justify-end': align === 'right',
        })}
      >
        {children}
      </div>
    </td>
  ),
)

ServerSideTableCell.displayName = 'ServerSideTableCell'

type CellProps = CommonCellProps & {
  preventDefault?: boolean
  fullWidth?: boolean
}
const TableCell = forwardRef<HTMLTableCellElement, CellProps>(
  (
    {
      className,
      children,
      align = 'left',
      xSpace = 'normal',
      preventDefault = false,
      verticalBorder = false,
      fullWidth = false,
      onClick,
      innerClassName,
      ...props
    },
    ref,
  ) => (
    <td
      ref={ref}
      className={cn(
        'align-middle [&:has([role=checkbox])]:pr-0',
        {
          'max-w-60': !fullWidth,
          'w-full': fullWidth,
          'px-2': xSpace === 'small',
          'px-4': xSpace === 'normal',
          'px-0': xSpace === 'none',
          'border-r last:border-r-0': verticalBorder,
        },
        className,
      )}
      {...props}
      onClick={(e) => {
        if (!preventDefault) return
        e.preventDefault()
        e.stopPropagation()
        onClick?.(e)
      }}
    >
      <div
        className={cn(innerClassName, 'flex', {
          'justify-start': align === 'left',
          'justify-center': align === 'center',
          'justify-end': align === 'right',
        })}
      >
        {children}
      </div>
    </td>
  ),
)
TableCell.displayName = 'TableCell'

const TableCaption = forwardRef<
  HTMLTableCaptionElement,
  HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn('mt-4 text-sm text-muted-foreground', className)}
    {...props}
  />
))
TableCaption.displayName = 'TableCaption'

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  ServerSideTableCell,
  TableCaption,
}

export { SortableTableHead, type SortDirection } from './sortedTable'
