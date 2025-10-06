import { IndentType } from '$/components/Sidebar/Files/NodeHeaderWrapper'

export function IndentationLine({ showCurve }: { showCurve: boolean }) {
  return (
    <div className='relative w-4 h-full flex justify-center'>
      {showCurve ? (
        <div className='relative -mt-1'>
          <div className='border-l h-2.5' />
          <div className='absolute top-2.5 border-l border-b h-2 w-2 rounded-bl-sm' />
        </div>
      ) : (
        <div className='bg-border w-px h-8 -mt-1' />
      )}
    </div>
  )
}

export function IndentationBar({
  indentation,
  hasChildren,
}: {
  hasChildren: boolean
  indentation: IndentType[]
}) {
  return indentation.map((indent, index) => {
    const anyNextIndentIsNotLast = !!indentation
      .slice(index)
      .find((i) => !i.isLast)
    const showBorder = anyNextIndentIsNotLast ? false : indent.isLast
    const showCurve = !hasChildren && showBorder
    return (
      <div key={index} className='h-6 min-w-4'>
        {index > 0 ? (
          <div className='relative w-4 h-full flex justify-center'>
            <IndentationLine showCurve={showCurve} />
          </div>
        ) : null}
      </div>
    )
  })
}
