import { type LucideProps } from 'lucide-react'

export default function Azure(props: LucideProps) {
  return (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      width='1em'
      height='1em'
      fill='currentColor'
      fillRule='evenodd'
      viewBox='0 0 24 24'
      {...props}
    >
      <path
        fill-opacity='.75'
        d='M18.397 15.296H7.4a.51.51 0 0 0-.347.882l7.066 6.595c.206.192.477.298.758.298h6.226l-2.706-7.775z'
      />
      <path
        fill-opacity='.5'
        d='M8.295.857c-.477 0-.9.304-1.053.756L.495 21.605a1.11 1.11 0 0 0 1.052 1.466h5.43c.477 0 .9-.304 1.053-.755l1.341-3.975-2.318-2.163a.51.51 0 0 1 .347-.882h3L15.271.857H8.295z'
      />
      <path d='M17.193 1.613a1.11 1.11 0 0 0-1.052-.756h-7.81.035c.477 0 .9.304 1.052.756l6.748 19.992a1.11 1.11 0 0 1-1.052 1.466h-.12 7.895a1.11 1.11 0 0 0 1.052-1.466L17.193 1.613z' />
    </svg>
  )
}
