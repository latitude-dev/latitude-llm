'use client'

import { cn } from '@latitude-data/web-ui/utils'

type ParameterValue = {
  product_name: string
  features: string
  target_audience: string
  tone: string
  word_count: number
}

type ParameterTableProps = {
  values: ParameterValue[]
}

export function ParameterTable({ values }: ParameterTableProps) {
  return (
    <div className='relative overflow-hidden rounded-t-lg'>
      {/* Inverted white gradient overlay - from transparent to white */}
      <div className='absolute inset-0 bg-gradient-to-t from-background/80 to-transparent pointer-events-none z-10' />

      <div className='overflow-hidden rounded-t-lg border border-foreground/10 border-b-0'>
        <div className='overflow-x-auto'>
          <table className='w-full border-collapse text-xs'>
            <thead>
              <tr className='bg-background'>
                <th className='px-3 py-2 text-left font-medium text-foreground/50'>
                  Product Name
                </th>
                <th className='px-3 py-2 text-left font-medium text-foreground/50'>
                  Features
                </th>
                <th className='px-3 py-2 text-left font-medium text-foreground/50'>
                  Target Audience
                </th>
                <th className='px-3 py-2 text-left font-medium text-foreground/50'>
                  Tone
                </th>
                <th className='px-3 py-2 text-left font-medium text-foreground/50'>
                  Word Count
                </th>
              </tr>
            </thead>
            <tbody>
              {values.map((value, index) => (
                <tr
                  key={index}
                  className={cn('border-t border-foreground/10', {
                    'bg-background': index % 2 === 0,
                    'bg-background/80': index % 2 !== 0,
                    'border-b-0': index === values.length - 1,
                  })}
                >
                  <td
                    className='px-3 py-2 max-w-[120px] truncate'
                    title={value.product_name}
                  >
                    {value.product_name}
                  </td>
                  <td
                    className='px-3 py-2 max-w-[150px] truncate'
                    title={value.features}
                  >
                    {value.features}
                  </td>
                  <td
                    className='px-3 py-2 max-w-[120px] truncate'
                    title={value.target_audience}
                  >
                    {value.target_audience}
                  </td>
                  <td
                    className='px-3 py-2 max-w-[100px] truncate'
                    title={value.tone}
                  >
                    {value.tone}
                  </td>
                  <td className='px-3 py-2'>{value.word_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
