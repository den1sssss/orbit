// Shared logic for the Life organizer: list/date/vault metadata, the list-item quantity
// parser, templates, expiry tones and the short-lived vault unlock window.
import {
  Archive, CalendarDays, Cake, Car, Contact, FileText, Footprints, Heart, HeartPulse, Hourglass, House, IdCard,
  KeyRound, ListTodo, Luggage, PartyPopper, RefreshCw, ShieldCheck, ShoppingCart, type LucideIcon,
} from 'lucide-react'
import { addDaysISO, diffDays, fmt } from '@/lib/dates'
import { uid, useStore } from '@/lib/store'
import type {
  ColorKey, ID, ImportantDateKind, ISODate, ListItem, OrgList, VaultField, VaultKind,
} from '@/lib/types'

// ───────────────────────── Lists ─────────────────────────

export type ListKind = OrgList['kind']

export const LIST_KINDS: Record<ListKind, { label: string; icon: LucideIcon }> = {
  shopping: { label: 'Shopping', icon: ShoppingCart },
  packing: { label: 'Packing', icon: Luggage },
  errands: { label: 'Errands', icon: Footprints },
  other: { label: 'Other', icon: ListTodo },
}
export const LIST_KIND_KEYS = Object.keys(LIST_KINDS) as ListKind[]

export interface ListTemplate {
  key: string
  name: string
  kind: ListKind
  color: ColorKey
  items: string[]
}

export const LIST_TEMPLATES: ListTemplate[] = [
  {
    key: 'groceries', name: 'Groceries', kind: 'shopping', color: 'green',
    items: ['Milk', 'Bread', 'Eggs', 'Fruit', 'Vegetables', 'Coffee'],
  },
  {
    key: 'packing', name: 'Travel packing', kind: 'packing', color: 'blue',
    items: ['Passport & tickets', 'Phone charger', 'Toiletries', 'Clothes', 'Medication', 'Headphones'],
  },
  {
    key: 'errands', name: 'Weekend errands', kind: 'errands', color: 'amber',
    items: ['Pharmacy', 'Post office', 'Dry cleaning', 'Car wash', 'Hardware store', 'Return library books'],
  },
]

const NUM = String.raw`\d+(?:[.,]\d+)?`
const UNIT = String.raw`(?:kg|g|mg|l|ml|cl|lb|lbs|oz|pcs?|packs?|bottles?|cans?|boxes|box|bags?|dozen)`
const RE_LEAD_X = new RegExp(String.raw`^(${NUM})\s*[x×*]\s+(.+)$`, 'i') // "2x milk", "2 x milk"
const RE_TRAIL_X = new RegExp(String.raw`^(.+?)\s+[x×*]\s*(${NUM})$`, 'i') // "milk x2", "milk x 2"
const RE_TRAIL_UNIT = new RegExp(String.raw`^(.+?)\s+(${NUM}\s*${UNIT})$`, 'i') // "milk 2kg", "milk 1.5 l"
const RE_LEAD_UNIT = new RegExp(String.raw`^(${NUM}\s*${UNIT})\s+(.+)$`, 'i') // "2kg potatoes"
const RE_LEAD_NUM = /^(\d{1,3})\s+(.+)$/ // "3 apples"

function capitalize(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

/** "2x milk" / "milk x2" / "milk 2kg" / "3 apples" → title + quantity. */
export function parseItem(input: string): { title: string; qty?: string } {
  const text = input.trim().replace(/\s+/g, ' ')
  let m = RE_LEAD_X.exec(text)
  if (m) return { title: capitalize(m[2]), qty: m[1] }
  m = RE_TRAIL_X.exec(text)
  if (m) return { title: capitalize(m[1]), qty: m[2] }
  m = RE_TRAIL_UNIT.exec(text)
  if (m) return { title: capitalize(m[1]), qty: m[2].replace(/\s+/g, '') }
  m = RE_LEAD_UNIT.exec(text)
  if (m) return { title: capitalize(m[2]), qty: m[1].replace(/\s+/g, '') }
  m = RE_LEAD_NUM.exec(text)
  if (m) return { title: capitalize(m[2]), qty: m[1] }
  return { title: capitalize(text) }
}

/** Show bare numbers as "×2"; units as typed ("2kg"). */
export function qtyLabel(qty: string | undefined): string | undefined {
  if (!qty) return undefined
  return /^\d+(?:[.,]\d+)?$/.test(qty) ? `×${qty}` : qty
}

export function newItem(title: string, qty?: string): ListItem {
  return { id: uid(), title, done: false, ...(qty ? { qty } : {}) }
}

/** Update a list's items from the latest store state (safe in rapid taps). */
export function updateItems(listId: ID, fn: (items: ListItem[]) => ListItem[]) {
  const s = useStore.getState()
  const list = s.lists.find((l) => l.id === listId)
  if (!list) return
  s.patch('lists', listId, { items: fn(list.items) })
}

export function toggleItem(listId: ID, itemId: ID) {
  updateItems(listId, (items) => items.map((i) => (i.id === itemId ? { ...i, done: !i.done } : i)))
}

export function listCounts(list: OrgList) {
  const done = list.items.filter((i) => i.done).length
  return { done, open: list.items.length - done, total: list.items.length }
}

// ───────────────────────── Important dates ─────────────────────────

export const DATE_KIND_META: Record<ImportantDateKind, { icon: LucideIcon; color: ColorKey }> = {
  birthday: { icon: Cake, color: 'pink' },
  anniversary: { icon: Heart, color: 'red' },
  renewal: { icon: RefreshCw, color: 'blue' },
  expiry: { icon: Hourglass, color: 'orange' },
  holiday: { icon: PartyPopper, color: 'green' },
  other: { icon: CalendarDays, color: 'slate' },
}
export const DATE_KIND_KEYS = Object.keys(DATE_KIND_META) as ImportantDateKind[]

export function defaultYearly(kind: ImportantDateKind): boolean {
  return kind === 'birthday' || kind === 'anniversary' || kind === 'holiday'
}

export const REMIND_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'On the day' },
  { value: 1, label: '1 day before' },
  { value: 3, label: '3 days before' },
  { value: 7, label: '7 days before' },
  { value: 14, label: '14 days before' },
]

export function remindLabel(days: number): string {
  return REMIND_OPTIONS.find((o) => o.value === days)?.label ?? `${days} days before`
}

/** "Today", "Tomorrow", "in 3 days", "in 4 months". */
export function countdown(days: number): string {
  if (days <= 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days <= 60) return `in ${days} days`
  const months = Math.round(days / 30.4)
  return months >= 12 ? 'in a year' : `in ${months} months`
}

// ───────────────────────── Vault ─────────────────────────

export const VAULT_KINDS: Record<VaultKind, { label: string; icon: LucideIcon; color: ColorKey }> = {
  id: { label: 'ID document', icon: IdCard, color: 'indigo' },
  document: { label: 'Document', icon: FileText, color: 'slate' },
  account: { label: 'Account', icon: KeyRound, color: 'violet' },
  insurance: { label: 'Insurance', icon: ShieldCheck, color: 'teal' },
  medical: { label: 'Medical', icon: HeartPulse, color: 'red' },
  vehicle: { label: 'Vehicle', icon: Car, color: 'blue' },
  home: { label: 'Home', icon: House, color: 'amber' },
  contact: { label: 'Contact', icon: Contact, color: 'green' },
  other: { label: 'Other', icon: Archive, color: 'slate' },
}
export const VAULT_KIND_KEYS = Object.keys(VAULT_KINDS) as VaultKind[]

/** Label + secret flag per kind. */
export const VAULT_TEMPLATES: Partial<Record<VaultKind, [string, boolean][]>> = {
  id: [['Full name', false], ['Number', true], ['Issued', false], ['Expires', false]],
  account: [['Website', false], ['Username', false], ['Password', true]],
  insurance: [['Provider', false], ['Policy number', true], ['Phone', false]],
  vehicle: [['Plate', false], ['VIN', false]],
  medical: [['Blood type', false], ['Allergies', false], ['Doctor', false]],
  home: [['Address', false], ['Wi-Fi name', false], ['Wi-Fi password', true]],
  contact: [['Name', false], ['Phone', false], ['Email', false]],
}

export function templateFields(kind: VaultKind): VaultField[] {
  return (VAULT_TEMPLATES[kind] ?? []).map(([label, secret]) => ({ id: uid(), label, value: '', secret }))
}

export const EXPIRY_WARN_DAYS = 60

export interface ExpiryInfo {
  tone: 'bad' | 'warn' | 'neutral'
  label: string
  days: number
}

export function expiryInfo(expiresOn: ISODate | undefined, today: ISODate): ExpiryInfo | undefined {
  if (!expiresOn) return undefined
  const days = diffDays(expiresOn, today)
  if (days < 0) return { tone: 'bad', label: 'Expired', days }
  if (days === 0) return { tone: 'bad', label: 'Expires today', days }
  if (days <= EXPIRY_WARN_DAYS) return { tone: 'warn', label: days === 1 ? 'Expires tomorrow' : `Expires in ${days} d`, days }
  const sameYear = expiresOn.slice(0, 4) === today.slice(0, 4)
  return { tone: 'neutral', label: `Expires ${fmt(expiresOn, sameYear ? 'd MMM' : 'MMM yyyy')}`, days }
}

/** Expired, or expiring within the warning window. */
export function isExpiringSoon(expiresOn: ISODate | undefined, today: ISODate): boolean {
  return !!expiresOn && expiresOn <= addDaysISO(today, EXPIRY_WARN_DAYS)
}

/** After the passcode is entered, secrets stay accessible for this long. */
export const UNLOCK_MS = 2 * 60_000
/** A revealed secret masks itself again after this long. */
export const REMASK_MS = 30_000

let unlockedUntil = 0

export function vaultUnlocked(): boolean {
  return Date.now() < unlockedUntil
}

export function markVaultUnlocked() {
  unlockedUntil = Date.now() + UNLOCK_MS
}

/** Clipboard write with a fallback for non-secure contexts. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}
