import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Copy,
  Ellipsis,
  EllipsisVertical,
  File,
  FilePlus,
  FolderClosed,
  FolderOpen,
  FolderPlus,
  ListOrdered,
  LoaderCircle,
  Lock,
  Moon,
  SquareDot,
  SquareMinus,
  SquarePlus,
  Sun,
  Trash,
} from 'lucide-react'

import { colors, type TextColor } from '$ui/ds/tokens'
import { cn } from '$ui/lib/utils'

import { LatitudeLogo, LatitudeLogoMonochrome } from './custom-icons'

export const Icons = {
  alert: CircleAlert,
  check: CheckCircle2,
  chevronDown: ChevronDown,
  chevronRight: ChevronRight,
  clipboard: Copy,
  ellipsis: Ellipsis,
  ellipsisVertical: EllipsisVertical,
  file: File,
  filePlus: FilePlus,
  folderClose: FolderClosed,
  folderOpen: FolderOpen,
  folderPlus: FolderPlus,
  listOrdered: ListOrdered,
  loader: LoaderCircle,
  lock: Lock,
  logo: LatitudeLogo,
  logoMonochrome: LatitudeLogoMonochrome,
  trash: Trash,
  sun: Sun,
  moon: Moon,
  addition: SquarePlus,
  deletion: SquareMinus,
  modification: SquareDot,
}

export type IconName = keyof typeof Icons

export type IconProps = {
  name: IconName
  color?: TextColor
  spin?: boolean
  size?: string | number
  widthClass?: string
  heightClass?: string
}

export function Icon({
  name,
  color,
  spin,
  widthClass,
  heightClass,
}: IconProps) {
  const IconClass = Icons[name]!
  return (
    <IconClass
      className={cn(widthClass, heightClass, {
        [colors.textColors[color!]]: color,
        'w-4': !widthClass,
        'h-4': !heightClass,
        'animate-spin': spin,
      })}
    />
  )
}
