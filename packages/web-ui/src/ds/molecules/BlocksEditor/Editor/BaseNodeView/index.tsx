import { ReactNode, JSX } from 'react'
import { NodeViewProps } from '@tiptap/react'
import { AnyBlock } from '@latitude-data/constants/simpleBlocks'
import { NodeViewWrapper } from '@tiptap/react'
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
}: {
  children: ReactNode
  errors?: Error[]
}) {
  return (
    <NodeViewWrapper
      className={cn('rounded border p-1', {
        'border-foreground': !errors.length,
        'border-red-100': errors.length > 0,
      })}
    >
      {children}

      {errors?.length > 0 ? (
        <div className='mt-2 text-red-500 text-sm'>
          {errors.map((err: Error, i: number) => (
            <div key={i}>{err.message}</div>
          ))}
        </div>
      ) : null}
    </NodeViewWrapper>
  )
}

export function withNodeViewProps<A>(
  Component: (props: TypedNodeViewProps<A>) => JSX.Element
) {
  return function Wrapped(props: NodeViewProps) {
    return <Component {...(props as any)} />
  }
}
