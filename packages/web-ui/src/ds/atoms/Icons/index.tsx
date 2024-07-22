import {
  ChevronDown,
  ChevronRight,
  Copy,
  File,
  FolderClosed,
  FolderOpen,
  type LucideIcon,
} from 'lucide-react'

import { LatitudeLogo, LatitudeLogoMonochrome } from './custom-icons'

export type Icon = LucideIcon

export const Icons = {
  logo: LatitudeLogo,
  logoMonochrome: LatitudeLogoMonochrome,
  chevronDown: ChevronDown,
  chevronRight: ChevronRight,
  folderClose: FolderClosed,
  file: File,
  folderOpen: FolderOpen,
  clipboard: Copy,
}
