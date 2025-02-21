export default function GridVertical({ className }: { className?: string }) {
  return (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      width='24'
      height='24'
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='2'
      strokeLinecap='round'
      strokeLinejoin='round'
      className={className}
    >
      <circle cx='9' cy='12' r='1' />
      <circle cx='9' cy='5' r='1' />
      <circle cx='9' cy='19' r='1' />
      <circle cx='15' cy='12' r='1' />
      <circle cx='15' cy='5' r='1' />
      <circle cx='15' cy='19' r='1' />
    </svg>
  )
}
