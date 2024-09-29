import {
  ArrowRightIcon,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  CircleHelp,
  CirclePlus,
  Code,
  Code2,
  Copy,
  Ellipsis,
  EllipsisVertical,
  ExternalLink,
  Eye,
  File,
  FilePlus,
  FileQuestion,
  FileUpIcon,
  FolderClosed,
  FolderOpen,
  FolderPlus,
  InfoIcon,
  ListOrdered,
  LoaderCircle,
  Lock,
  Moon,
  Pencil,
  Pin,
  PinOff,
  RefreshCcw,
  SquareDot,
  SquareMinus,
  SquarePlus,
  Sun,
  Trash,
} from 'lucide-react'

import { cn } from '../../../lib/utils'
import { colors, type TextColor } from '../../tokens'
import {
  Evaluation,
  LatitudeLogo,
  LatitudeLogoMonochrome,
} from './custom-icons'

const Icons = {
  addCircle: CirclePlus,
  addSquare: SquarePlus,
  alert: CircleAlert,
  check: CheckCircle2,
  chevronUp: ChevronUp,
  chevronDown: ChevronDown,
  chevronRight: ChevronRight,
  chevronLeft: ChevronLeft,
  clipboard: Copy,
  deletion: SquareMinus,
  ellipsis: Ellipsis,
  ellipsisVertical: EllipsisVertical,
  evaluation: Evaluation,
  file: File,
  fileUp: FileUpIcon,
  filePlus: FilePlus,
  folderClose: FolderClosed,
  folderOpen: FolderOpen,
  folderPlus: FolderPlus,
  info: InfoIcon,
  listOrdered: ListOrdered,
  loader: LoaderCircle,
  lock: Lock,
  logo: LatitudeLogo,
  logoMonochrome: LatitudeLogoMonochrome,
  modification: SquareDot,
  moon: Moon,
  trash: Trash,
  code: Code,
  code2: Code2,
  sun: Sun,
  eye: Eye,
  externalLink: ExternalLink,
  pencil: Pencil,
  refresh: RefreshCcw,
  arrowRight: ArrowRightIcon,
  fileQuestion: FileQuestion,
  circleHelp: CircleHelp,
  pin: Pin,
  pinOff: PinOff,
}

export type IconName = keyof typeof Icons

export type IconProps = {
  name: IconName
  color?: TextColor
  spin?: boolean
  size?: Size
  widthClass?: string
  heightClass?: string
  className?: string
}

type Size = 'normal' | 'large' | 'xlarge' | 'xxxlarge'

export function Icon({
  name,
  color,
  spin,
  size = 'normal',
  className,
}: IconProps) {
  const IconClass = Icons[name]!
  return (
    <IconClass
      className={cn(
        {
          [colors.textColors[color!]]: color,
          'w-4 h-4': size === 'normal',
          'w-6 h-6': size === 'large',
          'w-8 h-8': size === 'xlarge',
          'w-14 h-14': size === 'xxxlarge',
          'animate-spin': spin,
        },
        className,
      )}
    />
  )
}
