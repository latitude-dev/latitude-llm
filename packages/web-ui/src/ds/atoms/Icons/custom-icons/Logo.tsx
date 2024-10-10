import { type LucideProps } from 'lucide-react'

export default function LatitudeLogo(props: LucideProps) {
  return (
    <svg viewBox='0 0 32 32' fill='none' {...props}>
      <path
        fill='#0080FF'
        fillRule='evenodd'
        d='M0 15.173v.025h3.648C4.056 8.752 9.442 3.645 16 3.645c6.55 0 11.92 5.106 12.34 11.553H32C31.584 6.728 24.584 0 16 0 7.424 0 .43 6.714 0 15.173Z'
        clipRule='evenodd'
      />
      <path
        className='fill-[#030712] dark:fill-white'
        fillRule='evenodd'
        d='M0 16.79C.41 25.28 7.412 32 16 32c8.59 0 15.59-6.72 16-15.21H0Z'
        clipRule='evenodd'
      />
      <path
        fill='#E53948'
        fillRule='evenodd'
        d='M5.254 15.198h4.358c.395-3.17 3.114-5.622 6.388-5.622 3.265 0 5.966 2.463 6.375 5.622h4.37A10.754 10.754 0 0 0 16 5.236c-5.694 0-10.339 4.385-10.745 9.962Z'
        clipRule='evenodd'
      />
      <path
        fill='#FEC61A'
        fillRule='evenodd'
        d='M11.231 15.198h9.525c-.39-2.293-2.358-4.042-4.756-4.042a4.83 4.83 0 0 0-4.769 4.042Z'
        clipRule='evenodd'
      />
    </svg>
  )
}
