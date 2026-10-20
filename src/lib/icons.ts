import {
  Banknote, Briefcase, Bus, Car, Coffee, CreditCard, Dumbbell, Film, Gift, GraduationCap,
  HandCoins, HeartPulse, Home, Laptop, Lightbulb, type LucideIcon, Package, PawPrint,
  PiggyBank, Plane, Receipt, Repeat, Shirt, ShoppingBag, ShoppingCart, Smartphone,
  Sparkles, TrendingUp, Utensils, Wallet, Wifi, Wrench, Baby, Fuel, BadgePercent,
} from 'lucide-react'
import type { ColorKey } from './types'

/** Icons available for finance categories. Keys are stored in data. */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  wallet: Wallet,
  banknote: Banknote,
  briefcase: Briefcase,
  laptop: Laptop,
  percent: BadgePercent,
  coins: HandCoins,
  trending: TrendingUp,
  gift: Gift,
  cart: ShoppingCart,
  utensils: Utensils,
  coffee: Coffee,
  bus: Bus,
  car: Car,
  fuel: Fuel,
  receipt: Receipt,
  repeat: Repeat,
  wifi: Wifi,
  phone: Smartphone,
  home: Home,
  wrench: Wrench,
  bag: ShoppingBag,
  shirt: Shirt,
  health: HeartPulse,
  gym: Dumbbell,
  film: Film,
  plane: Plane,
  education: GraduationCap,
  baby: Baby,
  pet: PawPrint,
  package: Package,
  card: CreditCard,
  piggy: PiggyBank,
  idea: Lightbulb,
  sparkles: Sparkles,
}

export function categoryIcon(key: string | undefined): LucideIcon {
  return (key && CATEGORY_ICONS[key]) || Wallet
}

/**
 * Identity colors for user-tagged things (categories, projects, events).
 * Mid-tone steps that read on both light and dark surfaces as dots, bars and tints.
 */
export const COLORS: Record<ColorKey, string> = {
  slate: '#71717f',
  red: '#e5484d',
  orange: '#f76b15',
  amber: '#e2a336',
  green: '#30a46c',
  teal: '#12a594',
  blue: '#0090ff',
  indigo: '#5b5bd6',
  violet: '#8e4ec6',
  pink: '#d6409f',
}

export const COLOR_KEYS = Object.keys(COLORS) as ColorKey[]

export function colorHex(key: ColorKey | undefined, fallback: ColorKey = 'indigo'): string {
  return COLORS[key ?? fallback] ?? COLORS[fallback]
}

/** Translucent tint of an identity color for chip / icon backgrounds. */
export function tint(key: ColorKey | undefined, alpha = 0.14): string {
  const hex = colorHex(key)
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}
