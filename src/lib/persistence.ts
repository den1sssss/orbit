// Local-first persistence: IndexedDB, autosave, daily snapshots, optional encryption.
import { createStore, del, get, keys, set } from 'idb-keyval'
import { cryptoAvailable, deriveKey, fromB64, open, randomBytes, seal, toB64, type Sealed } from './crypto'
import { normalizeData } from './defaults'
import { todayISO } from './dates'
import { getData, useStore } from './store'
import { useUI } from './ui'
import type { AppData } from './types'

const db = createStore('orbit-db', 'kv')
const MAIN = 'main'
const SNAP_PREFIX = 'snap:'
const KEEP_SNAPSHOTS = 7

type PlainEnvelope = { v: 1; encrypted: false; savedAt: number; data: AppData }
type SealedEnvelope = { v: 1; encrypted: true; savedAt: number; salt: string } & Sealed
export type Envelope = PlainEnvelope | SealedEnvelope

interface Session {
  key: CryptoKey
  salt: Uint8Array
}

/** Present while a passcode is configured and the app is unlocked. */
let session: Session | null = null
/** True when data on disk is encrypted (passcode configured). */
let encryptedMode = false
let saveTimer: number | undefined
let dirty = false
let started = false

export function isEncrypted() {
  return encryptedMode
}

async function wrap(data: AppData): Promise<Envelope> {
  const savedAt = Date.now()
  if (encryptedMode) {
    if (!session) throw new Error('Locked')
    const sealed = await seal(session.key, data)
    return { v: 1, encrypted: true, savedAt, salt: toB64(session.salt), ...sealed }
  }
  return { v: 1, encrypted: false, savedAt, data }
}

async function unwrap(env: Envelope, s: Session | null = session): Promise<AppData> {
  if (!env.encrypted) return normalizeData(env.data)
  if (!s) throw new Error('Locked')
  return normalizeData(await open<AppData>(s.key, env))
}

/** Load from disk. Resolves to the resulting UI status. */
export async function boot(): Promise<'ready' | 'locked'> {
  try {
    navigator.storage?.persist?.().catch(() => {})
  } catch { /* not supported */ }
  const env = (await get<Envelope>(MAIN, db)) ?? null
  if (!env) {
    useUI.setState({ status: 'ready' })
    startAutosave()
    return 'ready'
  }
  if (env.encrypted) {
    encryptedMode = true
    useUI.setState({ status: 'locked' })
    return 'locked'
  }
  useStore.getState().replaceAll(await unwrap(env))
  useUI.setState({ status: 'ready' })
  startAutosave()
  return 'ready'
}

/** Try a passcode against the stored data. */
export async function unlock(passcode: string): Promise<boolean> {
  const env = await get<Envelope>(MAIN, db)
  if (!env || !env.encrypted) {
    useUI.setState({ status: 'ready' })
    return true
  }
  const salt = fromB64(env.salt)
  const s = { key: await deriveKey(passcode, salt), salt }
  try {
    const data = await unwrap(env, s)
    session = s
    useStore.getState().replaceAll(data)
    useUI.setState({ status: 'ready' })
    startAutosave()
    return true
  } catch {
    return false
  }
}

/** Flush pending changes, forget the key, and show the lock screen. */
export async function lock() {
  if (!encryptedMode) return
  await flush()
  session = null
  useUI.setState({ status: 'locked', editor: null, quickAddOpen: false })
}

function startAutosave() {
  if (started) return
  started = true
  useStore.subscribe((s, prev) => {
    if (s === prev) return
    dirty = true
    useUI.setState({ saveState: 'saving' })
    window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => void flush(), 400)
  })
  const onHide = () => {
    if (document.visibilityState === 'hidden') void flush()
  }
  document.addEventListener('visibilitychange', onHide)
  window.addEventListener('pagehide', () => void flush())
}

/** Write current state now (also takes the daily snapshot). */
export async function flush() {
  window.clearTimeout(saveTimer)
  if (!dirty) return
  if (encryptedMode && !session) return // never write plaintext while locked
  dirty = false
  try {
    const env = await wrap(getData())
    await set(MAIN, env, db)
    await snapshotIfNeeded(env)
    useUI.setState({ saveState: 'saved', lastSavedAt: env.savedAt })
  } catch (err) {
    console.error('Save failed', err)
    dirty = true
    useUI.setState({ saveState: 'error' })
  }
}

// ───────────────────────── Snapshots (automatic daily backups) ─────────────────────────

async function snapshotIfNeeded(env: Envelope) {
  const key = SNAP_PREFIX + todayISO()
  const existing = await get(key, db)
  if (existing) return
  await set(key, env, db)
  const all = (await snapshotKeys()).sort()
  const excess = all.slice(0, Math.max(0, all.length - KEEP_SNAPSHOTS))
  await Promise.all(excess.map((k) => del(k, db)))
}

async function snapshotKeys(): Promise<string[]> {
  return (await keys(db)).map(String).filter((k) => k.startsWith(SNAP_PREFIX))
}

export async function listSnapshots(): Promise<{ date: string; savedAt: number }[]> {
  const ks = await snapshotKeys()
  const out = await Promise.all(
    ks.map(async (k) => {
      const env = await get<Envelope>(k, db)
      return { date: k.slice(SNAP_PREFIX.length), savedAt: env?.savedAt ?? 0 }
    }),
  )
  return out.sort((a, b) => b.date.localeCompare(a.date))
}

export async function restoreSnapshot(date: string) {
  const env = await get<Envelope>(SNAP_PREFIX + date, db)
  if (!env) throw new Error('Snapshot not found')
  useStore.getState().replaceAll(await unwrap(env))
  await flush()
}

// ───────────────────────── Passcode management ─────────────────────────

/** Re-encrypt main data and all snapshots with a new session (or none). */
async function reencryptAll(next: Session | null) {
  await flush()
  const ks = [MAIN, ...(await snapshotKeys())]
  const decoded: [string, AppData, number][] = []
  for (const k of ks) {
    const env = await get<Envelope>(k, db)
    if (env) decoded.push([k, await unwrap(env), env.savedAt])
  }
  session = next
  encryptedMode = !!next
  for (const [k, data, savedAt] of decoded) {
    const env = await wrap(data)
    await set(k, { ...env, savedAt }, db)
  }
  if (!decoded.length) {
    dirty = true
    await flush()
  }
}

export async function enablePasscode(passcode: string) {
  if (!cryptoAvailable()) throw new Error('Encryption needs a secure (https) connection')
  const salt = randomBytes(16)
  await reencryptAll({ key: await deriveKey(passcode, salt), salt })
}

export async function verifyPasscode(passcode: string): Promise<boolean> {
  const env = await get<Envelope>(MAIN, db)
  if (!env || !env.encrypted) return true
  const salt = fromB64(env.salt)
  try {
    await unwrap(env, { key: await deriveKey(passcode, salt), salt })
    return true
  } catch {
    return false
  }
}

export async function disablePasscode(current: string): Promise<boolean> {
  if (!(await verifyPasscode(current))) return false
  await reencryptAll(null)
  return true
}

export async function changePasscode(current: string, next: string): Promise<boolean> {
  if (!(await verifyPasscode(current))) return false
  await enablePasscode(next)
  return true
}

// ───────────────────────── Export / import ─────────────────────────

export type BackupFile =
  | { app: 'orbit'; exportedAt: number; encrypted: false; data: AppData }
  | { app: 'orbit'; exportedAt: number; encrypted: true; salt: string; iv: string; ct: string }

export async function exportBackup(encrypt: boolean): Promise<Blob> {
  await flush()
  const data = getData()
  let file: BackupFile
  if (encrypt && session) {
    const sealed = await seal(session.key, data)
    file = { app: 'orbit', exportedAt: Date.now(), encrypted: true, salt: toB64(session.salt), ...sealed }
  } else {
    file = { app: 'orbit', exportedAt: Date.now(), encrypted: false, data }
  }
  useStore.getState().updateSettings({ lastExportAt: Date.now() })
  return new Blob([JSON.stringify(file, null, 1)], { type: 'application/json' })
}

/** Parse a backup file. Encrypted backups need the passcode they were made with. */
export async function readBackup(text: string, passcode?: string): Promise<AppData> {
  const parsed = JSON.parse(text) as BackupFile | AppData
  if ('app' in parsed && parsed.app === 'orbit') {
    if (!parsed.encrypted) return normalizeData(parsed.data)
    if (!passcode) throw new Error('PASSCODE_REQUIRED')
    const salt = fromB64(parsed.salt)
    const key = await deriveKey(passcode, salt)
    try {
      return normalizeData(await open<AppData>(key, parsed))
    } catch {
      throw new Error('Wrong passcode for this backup')
    }
  }
  if ('tasks' in parsed && 'settings' in parsed) return normalizeData(parsed)
  throw new Error('This file is not an Orbit backup')
}

export function backupNeedsPasscode(text: string): boolean {
  try {
    const p = JSON.parse(text)
    return p?.app === 'orbit' && p?.encrypted === true
  } catch {
    return false
  }
}

/** Wipe everything on this device. */
export async function eraseAll() {
  window.clearTimeout(saveTimer)
  const ks = await keys(db)
  await Promise.all(ks.map((k) => del(k, db)))
  session = null
  encryptedMode = false
  dirty = false
}
