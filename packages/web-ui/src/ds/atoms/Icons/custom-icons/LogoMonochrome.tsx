import type { LucideProps } from 'lucide-react'

export default function LogoMonochrome(props: LucideProps) {
  return (
    <svg viewBox='0 0 56 56' fill='none' {...props}>
      <g className='fill-current' fillRule='evenodd' clipRule='evenodd'>
        <path d='M0 26.553v.044h6.385C7.098 15.317 16.525 6.378 28 6.378c11.462 0 20.86 8.937 21.593 20.219H56C55.272 11.774 43.023 0 28 0 12.993 0 .75 11.75 0 26.552v.001ZM0 29.381C.718 44.24 12.97 56 28 56c15.031 0 27.283-11.76 28-26.619H0Z' />
        <path d='M9.195 26.596h7.626c.691-5.547 5.45-9.838 11.178-9.838 5.716 0 10.44 4.31 11.157 9.838h7.648c-.72-9.775-8.847-17.433-18.805-17.433-9.965 0-18.093 7.674-18.805 17.433Z' />
        <path d='M19.654 26.596h16.669c-.683-4.012-4.126-7.074-8.324-7.074-4.212 0-7.677 3.058-8.345 7.074Z' />
      </g>
    </svg>
  )
}
