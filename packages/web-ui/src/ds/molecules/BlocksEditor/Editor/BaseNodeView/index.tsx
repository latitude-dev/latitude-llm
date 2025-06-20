import { ReactNode, JSX } from 'react'
import { NodeViewProps } from '@tiptap/react'
import { AnyBlock } from '@latitude-data/constants/simpleBlocks'
import { NodeViewWrapper } from '@tiptap/react'
import { Icon } from '../../../../atoms/Icons'
import { cn } from '../../../../../lib/utils'

type Error<T extends AnyBlock['errors'] = AnyBlock['errors']> =
  T extends Array<infer U> ? U : never

type BaseAttrs = {
  id: string
  errors?: Error[]
}

export type TypedNodeViewProps<Attr> = Omit<NodeViewProps, 'node'> & {
  node: Omit<NodeViewProps['node'], 'attrs'> & {
    attrs: BaseAttrs & Attr
  }
}

export function BaseNodeView({
  children,
  errors = [],
  as,
  className,
  draggable = true,
}: {
  children: ReactNode
  errors?: Error[]
  className?: string
  as?: string
  draggable?: boolean
}) {
      // {draggable ? (
      //   <div className='absolute -left-6 top-0.5 bottom-0 w-6 flex transition opacity-0 group-hover/row:opacity-100'>
      //     <Icon name='gridVertical' color='foregroundMuted' />
      //   </div>
      // ) : null}

  return (
    <NodeViewWrapper as={as} className={cn('relative group/row', className)}>
      {children}

      {/* FIXME: Style errors in a nice way */}
      {errors?.length > 0 ? (
        <div className='text-red-500 text-sm'>
          {errors.map((err: Error, i: number) => (
            <div key={i}>{err.message}</div>
          ))}
        </div>
      ) : null}
    </NodeViewWrapper>
  )
}

export function withNodeViewProps<A>(
  Component: (props: TypedNodeViewProps<A>) => JSX.Element,
) {
  return function Wrapped(props: NodeViewProps) {
    return <Component {...(props as any)} />
  }
}
