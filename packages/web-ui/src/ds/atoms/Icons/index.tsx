import {
  ALargeSmallIcon,
  AlertCircle,
  AppWindow,
  ArrowDownIcon,
  ArrowLeft,
  ArrowRightIcon,
  ArrowUpIcon,
  ArrowUpRight,
  AtSign,
  BarChart4,
  Blend,
  Blocks,
  BookMarked,
  Bot,
  Braces,
  Brain,
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
  CircleArrowUp,
  CircleChevronLeft,
  CircleChevronRight,
  CircleDollarSign,
  CircleHelp,
  CircleIcon,
  CirclePlus,
  CircleStop,
  CircleUser,
  Clock,
  Code,
  Code2,
  Copy,
  CpuIcon,
  Database,
  Ellipsis,
  EllipsisVertical,
  EqualApproximatelyIcon,
  EqualIcon,
  EqualNotIcon,
  ExternalLink,
  Eye,
  File,
  FileDown,
  FilePlus,
  FileQuestion,
  FileUpIcon,
  FileX2,
  FolderClosed,
  FolderOpen,
  FolderPlus,
  GitCompareArrows,
  Github,
  Gitlab,
  Globe,
  History,
  House,
  Image,
  ImageOff,
  ImageUp,
  InfoIcon,
  LetterText,
  Lightbulb,
  ListCheck,
  ListOrdered,
  ListVideo,
  LoaderCircle,
  Lock,
  Logs,
  MapPin,
  Maximize2,
  Minimize2,
  MinusIcon,
  MonitorIcon,
  Moon,
  Newspaper,
  Paperclip,
  Pause,
  Pencil,
  Pin,
  PinOff,
  Play,
  Puzzle,
  Radio,
  RefreshCcw,
  RegexIcon,
  RotateCcw,
  ScrollTextIcon,
  SearchIcon,
  SettingsIcon,
  Slack,
  Space,
  Sparkles,
  Square,
  SquareArrowRight,
  SquareDot,
  SquareMinus,
  SquarePlus,
  Star,
  Sun,
  Terminal,
  Thermometer,
  ThumbsDown,
  ThumbsUp,
  Trash,
  Twitter,
  Undo,
  Unplug,
  UserRound,
  WholeWord,
  XIcon,
  Youtube,
} from 'lucide-react'
import { MouseEvent } from 'react'

import { cn } from '../../../lib/utils'
import { colors, DarkTextColor, type TextColor } from '../../tokens'
import {
  GridVertical,
  LatitudeLogo,
  LatitudeLogoMonochrome,
  MCP,
} from './custom-icons'
import Airbnb from './custom-icons/logos/Airbnb'
import Airtable from './custom-icons/logos/Airtable'
import Apify from './custom-icons/logos/Apify'
import Attio from './custom-icons/logos/Attio'
import Audiense from './custom-icons/logos/Audiense'
import AwsBedrock from './custom-icons/logos/AwsBedrock'
import Brave from './custom-icons/logos/Brave'
import Browserbase from './custom-icons/logos/Browserbase'
import Discord from './custom-icons/logos/Discord'
import Exa from './custom-icons/logos/Exa'
import Figma from './custom-icons/logos/Figma'
import Ghost from './custom-icons/logos/Ghost'
import Google from './custom-icons/logos/Google'
import Hyperbrowser from './custom-icons/logos/Hyperbrowser'
import Intercom from './custom-icons/logos/Intercom'
import IntercomChat from './custom-icons/logos/IntercomChat'
import Jira from './custom-icons/logos/Jira'
import Linear from './custom-icons/logos/Linear'
import Mintlify from './custom-icons/logos/Mintlify'
import Monday from './custom-icons/logos/Monday'
import Neon from './custom-icons/logos/Neon'
import Notion from './custom-icons/logos/Notion'
import Postgres from './custom-icons/logos/Postgres'
import Readwise from './custom-icons/logos/Readwise'
import Reddit from './custom-icons/logos/Reddit'
import Redis from './custom-icons/logos/Redis'
import Sentry from './custom-icons/logos/Sentry'
import Stripe from './custom-icons/logos/Stripe'
import Supabase from './custom-icons/logos/Supabase'
import Telegram from './custom-icons/logos/Telegram'
import Tinybird from './custom-icons/logos/Tinybird'
import TwitterX from './custom-icons/logos/TwitterX'
import Wordpress from './custom-icons/logos/Wordpress'
import YepCode from './custom-icons/logos/YepCode'
import OpenAI from './custom-icons/llmProviders/openai'
import Anthropic from './custom-icons/llmProviders/anthropic'
import Groq from './custom-icons/llmProviders/groq'
import Mistral from './custom-icons/llmProviders/mistral'
import Azure from './custom-icons/llmProviders/azure'
import GoogleGemini from './custom-icons/llmProviders/googleGemini'
import GoogleVertex from './custom-icons/llmProviders/googleVertex'
import XAI from './custom-icons/llmProviders/xai'
import AmazonBedrock from './custom-icons/llmProviders/amazoBedrock'
import DeepSeek from './custom-icons/llmProviders/deepSeek'
import Perplexity from './custom-icons/llmProviders/perplexity'

const Icons = {
  // hubspot: Hubspot,
  addCircle: CirclePlus,
  addSquare: SquarePlus,
  airbnb: Airbnb,
  airtable: Airtable,
  alert: CircleAlert,
  alertCircle: AlertCircle,
  apify: Apify,
  appWindow: AppWindow,
  arrowDown: ArrowDownIcon,
  arrowLeft: ArrowLeft,
  arrowRight: ArrowRightIcon,
  arrowUp: ArrowUpIcon,
  arrowUpRight: ArrowUpRight,
  atSign: AtSign,
  attio: Attio,
  audiense: Audiense,
  awsBedrock: AwsBedrock,
  barChart4: BarChart4,
  blocks: Blocks,
  bookMarked: BookMarked,
  bot: Bot,
  cpu: CpuIcon,
  braces: Braces,
  brain: Brain,
  brave: Brave,
  browserbase: Browserbase,
  calendar: CalendarIcon,
  check: CheckCircle2,
  checkClean: CheckIcon,
  chevronDown: ChevronDown,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  chevronUp: ChevronUp,
  chevronsDownUp: ChevronsDownUpIcon,
  chevronsUpDown: ChevronsUpDown,
  circle: CircleIcon,
  circleArrowUp: CircleArrowUp,
  circleChevronLeft: CircleChevronLeft,
  circleChevronRight: CircleChevronRight,
  circleDollarSign: CircleDollarSign,
  circleHelp: CircleHelp,
  circleStop: CircleStop,
  circleUser: CircleUser,
  clipboard: Copy,
  clock: Clock,
  close: XIcon,
  code2: Code2,
  code: Code,
  database: Database,
  deletion: SquareMinus,
  discord: Discord,
  ellipsis: Ellipsis,
  ellipsisVertical: EllipsisVertical,
  equal: EqualIcon,
  equalApproximately: EqualApproximatelyIcon,
  externalLink: ExternalLink,
  eye: Eye,
  figma: Figma,
  file: File,
  fileDown: FileDown,
  fileOff: FileX2,
  filePlus: FilePlus,
  fileQuestion: FileQuestion,
  fileUp: FileUpIcon,
  folderClose: FolderClosed,
  folderOpen: FolderOpen,
  folderPlus: FolderPlus,
  ghost: Ghost,
  github: Github,
  gitlab: Gitlab,
  globe: Globe,
  googleWorkspace: Google,
  gridVertical: GridVertical,
  history: History,
  house: House,
  hyperbrowser: Hyperbrowser,
  image: Image,
  imageOff: ImageOff,
  imageUp: ImageUp,
  info: InfoIcon,
  intercom: Intercom,
  intercomChat: IntercomChat,
  jira: Jira,
  letterText: LetterText,
  lightBulb: Lightbulb,
  linear: Linear,
  listCheck: ListCheck,
  listOrdered: ListOrdered,
  listVideo: ListVideo,
  loader: LoaderCircle,
  lock: Lock,
  logo: LatitudeLogo,
  logoMonochrome: LatitudeLogoMonochrome,
  logs: Logs,
  mapPin: MapPin,
  maximize: Maximize2,
  mcp: MCP,
  minimize: Minimize2,
  mintlify: Mintlify,
  minus: MinusIcon,
  modification: SquareDot,
  monitor: MonitorIcon,
  moon: Moon,
  neon: Neon,
  newspaper: Newspaper,
  notEqual: EqualNotIcon,
  notion: Notion,
  paperclip: Paperclip,
  pause: Pause,
  pencil: Pencil,
  pin: Pin,
  pinOff: PinOff,
  play: Play,
  postgres: Postgres,
  puzzle: Puzzle,
  radio: Radio,
  readwise: Readwise,
  reddit: Reddit,
  redis: Redis,
  refresh: RefreshCcw,
  regex: RegexIcon,
  rollText: ScrollTextIcon,
  rotate: RotateCcw,
  search: SearchIcon,
  sentry: Sentry,
  settings: SettingsIcon,
  slack: Slack,
  sparkles: Sparkles,
  square: Square,
  squareArrowRight: SquareArrowRight,
  star: Star,
  stripe: Stripe,
  sun: Sun,
  supabase: Supabase,
  telegram: Telegram,
  terminal: Terminal,
  thermometer: Thermometer,
  thumbsDown: ThumbsDown,
  thumbsUp: ThumbsUp,
  tinybird: Tinybird,
  trash: Trash,
  twitter: Twitter,
  twitterX: TwitterX,
  undo: Undo,
  unplug: Unplug,
  userRound: UserRound,
  wholeWord: WholeWord,
  wordpress: Wordpress,
  youtube: Youtube,
  space: Space,
  blend: Blend,
  exa: Exa,
  yepcode: YepCode,
  monday: Monday,
  gitCompareArrows: GitCompareArrows,
  aLargeSmall: ALargeSmallIcon,
  openai: OpenAI,
  anthropic: Anthropic,
  groq: Groq,
  mistral: Mistral,
  azure: Azure,
  googleGemini: GoogleGemini,
  googleVertex: GoogleVertex,
  xai: XAI,
  amazonBedrock: AmazonBedrock,
  deepSeek: DeepSeek,
  perplexity: Perplexity,
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
  onClick?: (event: MouseEvent<SVGSVGElement>) => void
}

type Size = 'xsmall' | 'small' | 'normal' | 'large' | 'xlarge' | 'xxxlarge'

export function Icon({
  name,
  color,
  darkColor,
  spin,
  spinSpeed = 'normal',
  size = 'normal',
  className,
  onClick,
}: IconProps) {
  const IconClass = Icons[name]!
  return (
    <IconClass
      className={cn(
        {
          [colors.textColors[color!]]: color,
          [colors.darkTextColors[darkColor!]]: darkColor,
          'w-2.5 h-2.5': size === 'xsmall',
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
      onClick={onClick}
    />
  )
}
