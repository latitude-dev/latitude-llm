import type { LucideProps } from 'lucide-react'

export default function Hyperbrowser(props: LucideProps) {
  return (
    <svg viewBox='0 0 200 200' fill='none' {...props}>
      <g clipPath='url(#clip0_128_35)'>
        <path d='M200 0H0V200H200V0Z' fill='none' />
        <g filter='url(#filter0_d_128_35)'>
          <path
            d='M44 112L101 40V78.5C101 85.1274 106.373 90.5 113 90.5H156.5L101 160.5V124C101 117.373 95.6274 112 89 112H44Z'
            fill='currentColor'
          />
          <path
            d='M44 112L101 40V78.5C101 85.1274 106.373 90.5 113 90.5H156.5L101 160.5V124C101 117.373 95.6274 112 89 112H44Z'
            stroke='black'
            strokeWidth='16'
            strokeLinejoin='round'
          />
        </g>
      </g>
      <defs>
        <filter
          id='filter0_d_128_35'
          x='15.9999'
          y='19.9995'
          width='160.5'
          height='168.501'
          filterUnits='userSpaceOnUse'
          colorInterpolationFilters='sRGB'
        >
          <feFlood floodOpacity='0' result='BackgroundImageFix' />
          <feColorMatrix
            in='SourceAlpha'
            type='matrix'
            values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0'
            result='hardAlpha'
          />
          <feOffset dx='-4' dy='4' />
          <feGaussianBlur stdDeviation='8' />
          <feComposite in2='hardAlpha' operator='out' />
          <feColorMatrix type='matrix' values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.1 0' />
          <feBlend mode='normal' in2='BackgroundImageFix' result='effect1_dropShadow_128_35' />
          <feBlend
            mode='normal'
            in='SourceGraphic'
            in2='effect1_dropShadow_128_35'
            result='shape'
          />
        </filter>
        <clipPath id='clip0_128_35'>
          <rect width='200' height='200' fill='none' />
        </clipPath>
      </defs>
    </svg>
  )
}
