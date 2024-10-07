import {
  ArrowLeft,
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
  Sparkles,
  SquareDot,
  SquareMinus,
  SquarePlus,
  Sun,
  ThumbsDown,
  ThumbsUp,
  Trash,
  Undo,
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
  arrowLeft: ArrowLeft,
  arrowRight: ArrowRightIcon,
  check: CheckCircle2,
  chevronUp: ChevronUp,
  chevronDown: ChevronDown,
  chevronRight: ChevronRight,
  chevronLeft: ChevronLeft,
  circleHelp: CircleHelp,
  clipboard: Copy,
  code: Code,
  code2: Code2,
  deletion: SquareMinus,
  ellipsis: Ellipsis,
  ellipsisVertical: EllipsisVertical,
  evaluation: Evaluation,
  externalLink: ExternalLink,
  eye: Eye,
  file: File,
  fileUp: FileUpIcon,
  filePlus: FilePlus,
  fileQuestion: FileQuestion,
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
  pencil: Pencil,
  pin: Pin,
  pinOff: PinOff,
  refresh: RefreshCcw,
  sun: Sun,
  sparkles: Sparkles,
  thumbsDown: ThumbsDown,
  thumbsUp: ThumbsUp,
  trash: Trash,
  undo: Undo,
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

type Size = 'small' | 'normal' | 'large' | 'xlarge' | 'xxxlarge'

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
          'w-3 h-3': size === 'small',
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
