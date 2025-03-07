import {
  ArrowDownIcon,
  ArrowLeft,
  ArrowRightIcon,
  ArrowUpIcon,
  BarChart4,
  Bot,
  CalendarIcon,
  CheckCircle2,
  CheckIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsDownUpIcon,
  ChevronsUpDown,
  ChevronUp,
  CircleAlert,
  CircleHelp,
  CirclePlus,
  Code,
  Code2,
  Copy,
  Ellipsis,
  EllipsisVertical,
  EqualApproximatelyIcon,
  EqualNotIcon,
  ExternalLink,
  Eye,
  File,
  FilePlus,
  FileQuestion,
  FileUpIcon,
  FolderClosed,
  FolderOpen,
  FolderPlus,
  Github,
  History,
  Image,
  ImageUp,
  InfoIcon,
  LetterText,
  ListOrdered,
  LoaderCircle,
  Lock,
  Logs,
  MinusIcon,
  MonitorIcon,
  Moon,
  Paperclip,
  Pencil,
  Pin,
  PinOff,
  Puzzle,
  RefreshCcw,
  ScrollTextIcon,
  SearchIcon,
  SettingsIcon,
  Sparkles,
  SquareArrowRight,
  SquareDot,
  SquareMinus,
  SquarePlus,
  Star,
  Sun,
  Terminal,
  ThumbsDown,
  ThumbsUp,
  Trash,
  Twitter,
  Undo,
  XIcon,
  Braces,
  ListCheck,
  Newspaper,
  CircleDollarSign,
  Globe,
  Maximize2,
  Minimize2,
  Thermometer,
  ListVideo,
  WholeWord,
  AlertCircle,
  CircleArrowUp,
  Blocks,
  Slack,
  Youtube,
  Gitlab,
  MapPin,
  Database,
  AppWindow,
  Brain,
  Clock,
  CircleIcon,
  RegexIcon,
  EqualIcon,
  AtSign,
  CircleUser,
} from 'lucide-react'

import { cn } from '../../../lib/utils'
import { colors, DarkTextColor, type TextColor } from '../../tokens'
import {
  LatitudeLogo,
  LatitudeLogoMonochrome,
  GridVertical,
  MCP,
} from './custom-icons'
import Stripe from './custom-icons/logos/Stripe'
import Reddit from './custom-icons/logos/Reddit'
import Notion from './custom-icons/logos/Notion'
import Wordpress from './custom-icons/logos/Wordpress'
import Telegram from './custom-icons/logos/Telegram'
import Google from './custom-icons/logos/Google'
import Discord from './custom-icons/logos/Discord'
import Intercom from './custom-icons/logos/Intercom'
import Jira from './custom-icons/logos/Jira'
import TwitterX from './custom-icons/logos/TwitterX'
import Linear from './custom-icons/logos/Linear'
import Airtable from './custom-icons/logos/Airtable'
import Tinybird from './custom-icons/logos/Tinybird'
import Perplexity from './custom-icons/logos/Perplexity'
import AwsBedrock from './custom-icons/logos/AwsBedrock'
import Brave from './custom-icons/logos/Brave'
import Sentry from './custom-icons/logos/Sentry'
import Browserbase from './custom-icons/logos/Browserbase'
import Neon from './custom-icons/logos/Neon'
import Postgres from './custom-icons/logos/Postgres'
import Redis from './custom-icons/logos/Redis'
import Attio from './custom-icons/logos/Attio'
import Supabase from './custom-icons/logos/Supabase'
import Ghost from './custom-icons/logos/Ghost'
import Figma from './custom-icons/logos/Figma'

const Icons = {
  addCircle: CirclePlus,
  addSquare: SquarePlus,
  alert: CircleAlert,
  appWindow: AppWindow,
  arrowLeft: ArrowLeft,
  arrowRight: ArrowRightIcon,
  atSign: AtSign,
  barChart4: BarChart4,
  blocks: Blocks,
  brain: Brain,
  bot: Bot,
  calendar: CalendarIcon,
  check: CheckCircle2,
  checkClean: CheckIcon,
  chevronUp: ChevronUp,
  chevronDown: ChevronDown,
  chevronRight: ChevronRight,
  chevronLeft: ChevronLeft,
  chevronsUpDown: ChevronsUpDown,
  chevronsDownUp: ChevronsDownUpIcon,
  circleDollarSign: CircleDollarSign,
  circleHelp: CircleHelp,
  circleUser: CircleUser,
  circle: CircleIcon,
  clipboard: Copy,
  clock: Clock,
  code: Code,
  code2: Code2,
  database: Database,
  deletion: SquareMinus,
  minus: MinusIcon,
  ellipsis: Ellipsis,
  ellipsisVertical: EllipsisVertical,
  externalLink: ExternalLink,
  eye: Eye,
  file: File,
  fileUp: FileUpIcon,
  filePlus: FilePlus,
  fileQuestion: FileQuestion,
  folderClose: FolderClosed,
  folderOpen: FolderOpen,
  folderPlus: FolderPlus,
  globe: Globe,
  history: History,
  info: InfoIcon,
  listOrdered: ListOrdered,
  listVideo: ListVideo,
  loader: LoaderCircle,
  lock: Lock,
  logo: LatitudeLogo,
  logoMonochrome: LatitudeLogoMonochrome,
  mapPin: MapPin,
  maximize: Maximize2,
  minimize: Minimize2,
  modification: SquareDot,
  moon: Moon,
  monitor: MonitorIcon,
  newspaper: Newspaper,
  pencil: Pencil,
  pin: Pin,
  pinOff: PinOff,
  puzzle: Puzzle,
  refresh: RefreshCcw,
  search: SearchIcon,
  squareArrowRight: SquareArrowRight,
  star: Star,
  sun: Sun,
  sparkles: Sparkles,
  terminal: Terminal,
  thermometer: Thermometer,
  thumbsDown: ThumbsDown,
  thumbsUp: ThumbsUp,
  trash: Trash,
  undo: Undo,
  wholeWord: WholeWord,
  rollText: ScrollTextIcon,
  notEqual: EqualNotIcon,
  settings: SettingsIcon,
  paperclip: Paperclip,
  letterText: LetterText,
  image: Image,
  imageUp: ImageUp,
  logs: Logs,
  close: XIcon,
  arrowUp: ArrowUpIcon,
  arrowDown: ArrowDownIcon,
  equalApproximately: EqualApproximatelyIcon,
  braces: Braces,
  listCheck: ListCheck,
  alertCircle: AlertCircle,
  circleArrowUp: CircleArrowUp,
  gridVertical: GridVertical,
  equal: EqualIcon,
  regex: RegexIcon,
  mcp: MCP,
  stripe: Stripe,
  slack: Slack,
  github: Github,
  reddit: Reddit,
  youtube: Youtube,
  airtable: Airtable,
  notion: Notion,
  wordpress: Wordpress,
  twitter: Twitter,
  twitterX: TwitterX,
  linear: Linear,
  telegram: Telegram,
  tinybird: Tinybird,
  perplexity: Perplexity,
  googleWorkspace: Google,
  supabase: Supabase,
  // hubspot: Hubspot,
  attio: Attio,
  discord: Discord,
  gitlab: Gitlab,
  intercom: Intercom,
  jira: Jira,
  ghost: Ghost,
  awsBedrock: AwsBedrock,
  brave: Brave,
  sentry: Sentry,
  browserbase: Browserbase,
  neon: Neon,
  postgres: Postgres,
  redis: Redis,
  figma: Figma,
}

export type IconName = keyof typeof Icons

export type IconProps = {
  name: IconName
  color?: TextColor
  darkColor?: DarkTextColor
  spin?: boolean
  spinSpeed?: 'normal' | 'fast'
  size?: Size
  widthClass?: string
  heightClass?: string
  className?: string
}

type Size = 'small' | 'normal' | 'large' | 'xlarge' | 'xxxlarge'

export function Icon({
  name,
  color,
  darkColor,
  spin,
  spinSpeed = 'normal',
  size = 'normal',
  className,
}: IconProps) {
  const IconClass = Icons[name]!
  return (
    <IconClass
      className={cn(
        {
          [colors.textColors[color!]]: color,
          [colors.darkTextColors[darkColor!]]: darkColor,
          'w-3 h-3': size === 'small',
          'w-4 h-4': size === 'normal',
          'w-6 h-6': size === 'large',
          'w-8 h-8': size === 'xlarge',
          'w-14 h-14': size === 'xxxlarge',
          'animate-spin': spin,
          'duration-200': spinSpeed === 'fast',
        },
        className,
      )}
    />
  )
}
