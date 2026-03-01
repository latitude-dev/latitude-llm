import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bell,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  CreditCard,
  Database,
  Eye,
  EyeOff,
  File,
  FileText,
  Filter,
  Github,
  Globe,
  Home,
  Info,
  Key,
  Layers,
  Link,
  Loader2,
  Lock,
  LogIn,
  LogOut,
  type LucideProps,
  Mail,
  Menu,
  Moon,
  MoreHorizontal,
  MoreVertical,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  Shield,
  Star,
  Sun,
  Trash,
  Upload,
  User,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { forwardRef, memo } from "react";

import { type TextColor, colors } from "../../tokens/index.js";
import { cn } from "../../utils/cn.js";

const iconMap = {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Bell,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  CreditCard,
  Database,
  Eye,
  EyeOff,
  File,
  FileText,
  Filter,
  Github,
  Globe,
  Home,
  Info,
  Key,
  Layers,
  Link,
  Loader2,
  Lock,
  LogIn,
  LogOut,
  Mail,
  Menu,
  Moon,
  MoreHorizontal,
  MoreVertical,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  Shield,
  Star,
  Sun,
  Trash,
  Upload,
  User,
  Users,
  X,
  XCircle,
} as const;

export type IconName = keyof typeof iconMap;

const sizeMap = {
  xs: "h-3 w-3",
  sm: "h-4 w-4",
  default: "h-5 w-5",
  md: "h-6 w-6",
  lg: "h-8 w-8",
  xl: "h-10 w-10",
  "2xl": "h-12 w-12",
} as const;

export type IconSize = keyof typeof sizeMap;

export interface IconProps extends Omit<LucideProps, "size"> {
  name: IconName;
  size?: IconSize;
  color?: TextColor;
  className?: string;
}

const Icon = memo(
  forwardRef<SVGSVGElement, IconProps>(
    ({ name, size = "default", color, className, ...props }, ref) => {
      const LucideIcon = iconMap[name];

      if (!LucideIcon) {
        if (process.env.NODE_ENV !== "production") {
          console.warn(`Icon "${name}" not found`);
        }
        return null;
      }

      const colorClass = color ? colors.textColors[color] : "";

      return (
        <LucideIcon ref={ref} className={cn(sizeMap[size], colorClass, className)} {...props} />
      );
    },
  ),
);

Icon.displayName = "Icon";

export { Icon };
