import { useEffect, useRef, useState } from 'react'
import { DatabaseBackup, Download, HardDriveDownload, History, RotateCcw, Sparkles, Trash2, Upload } from 'lucide-react'
import { Button, Field, Input, Sheet, Toggle } from '@/components/ui'
import { buildDemoData } from '@/lib/demo'
import { emptyData } from '@/lib/defaults'
import { todayISO, UI_LOCALE } from '@/lib/dates'
import {
  backupNeedsPasscode, eraseAll, exportBackup, isEncrypted, listSnapshots, readBackup, restoreSnapshot,
} from '@/lib/persistence'
import { saveFile } from '@/lib/platform'
import { useStore } from '@/lib/store'
import { confirm, toast, useUI } from '@/lib/ui'
import type { AppData } from '@/lib/types'
import { Row, Section } from './Section'

function timeAgo(ts?: number) {
  if (!ts) return 'never'
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return new Date(ts).toLocaleDateString(UI_LOCALE, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function DataSettings() {
  const lastSavedAt = useUI((s) => s.lastSavedAt)
  const saveState = useUI((s) => s.saveState)
  const settings = useStore((s) => s.settings)
  const [snapshots, setSnapshots] = useState<{ date: string; savedAt: number }[]>([])
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [encryptExport, setEncryptExport] = useState(true)
  const [pending, setPending] = useState<{ text: string; name: string } | null>(null)
  const [passcode, setPasscode] = useState('')
  const [importError, setImportError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const enc = isEncrypted()

  useEffect(() => {
    void listSnapshots().then(setSnapshots)
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null))
  }, [lastSavedAt])

  const doExport = async () => {
    const blob = await exportBackup(enc && encryptExport)
    const result = await saveFile(blob, `orbit-backup-${todayISO()}${enc && encryptExport ? '-encrypted' : ''}.json`)
    if (result === 'downloaded') toast('Backup downloaded')
    else if (result === 'shared') toast('Backup saved')
  }

  const applyImport = async (data: AppData) => {
    const ok = await confirm({
      title: 'Replace all data with this backup?',
      message: 'Everything currently in Orbit on this device will be replaced. Today’s automatic snapshot can undo this.',
      confirmLabel: 'Replace',
      danger: true,
    })
    if (!ok) return
    useStore.getState().replaceAll({ ...data, settings: { ...data.settings, onboarded: true } })
    toast('Backup restored')
  }

  const onFile = async (file: File) => {
    setImportError('')
    const text = await file.text()
    if (backupNeedsPasscode(text)) {
      setPending({ text, name: file.name })
      return
    }
    try {
      await applyImport(await readBackup(text))
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not read that file', { tone: 'error' })
    }
  }

  const replaceWith = async (kind: 'demo' | 'empty' | 'erase') => {
    const copy = {
      demo: { title: 'Load sample data?', message: 'This replaces your current data with realistic sample data (your name and currency stay).', label: 'Load sample data' },
      empty: { title: 'Clear all records?', message: 'Deletes every task, note, event, journal entry and transaction. Settings stay.', label: 'Clear records' },
      erase: { title: 'Erase everything?', message: 'Deletes all data, snapshots and settings on this device, including your passcode. This can’t be undone.', label: 'Erase everything' },
    }[kind]
    const ok = await confirm({ title: copy.title, message: copy.message, confirmLabel: copy.label, danger: true })
    if (!ok) return
    if (kind === 'demo') useStore.getState().replaceAll(buildDemoData({ settings }))
    else if (kind === 'empty') useStore.getState().replaceAll({ ...emptyData(), settings })
    else {
      await eraseAll()
      useStore.getState().replaceAll(emptyData())
      location.reload()
    }
    toast(kind === 'demo' ? 'Sample data loaded' : 'Records cleared')
  }

  const exportDays = settings.lastExportAt ? Math.floor((Date.now() - settings.lastExportAt) / 86400000) : null

  return (
    <Section id="data" title="Data & backup" icon={DatabaseBackup} description="Saved automatically on this device, with daily snapshots.">
      <Row label="Autosave" hint={saveState === 'error' ? 'Last save failed — check storage space.' : `Last saved ${timeAgo(lastSavedAt)}`}>
        <p className="text-sm text-ink-2 sm:text-right">{saveState === 'error' ? 'Error' : 'On'}</p>
      </Row>
      {persisted !== null && (
        <Row label="Storage protection" hint={persisted ? 'The browser won’t clear Orbit’s data to free space.' : 'Install Orbit to your home screen so the browser keeps the data permanently.'}>
          <p className="text-sm text-ink-2 sm:text-right">{persisted ? 'Protected' : 'Best effort'}</p>
        </Row>
      )}

      <div>
        <p className="mb-2 flex items-center gap-2 text-sm font-medium text-ink"><History size={15} className="text-muted" /> Daily snapshots</p>
        {snapshots.length === 0 ? (
          <p className="text-[13px] text-muted">The first snapshot is taken with your first change today. The last 7 days are kept.</p>
        ) : (
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {snapshots.map((s) => (
              <li key={s.date} className="flex items-center gap-3 px-3 py-2">
                <span className="flex-1 text-sm text-ink">
                  {new Date(s.savedAt).toLocaleString(UI_LOCALE, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={RotateCcw}
                  onClick={async () => {
                    const ok = await confirm({ title: 'Restore this snapshot?', message: 'Your current data will be replaced by this version.', confirmLabel: 'Restore', danger: true })
                    if (!ok) return
                    await restoreSnapshot(s.date)
                    toast('Snapshot restored')
                  }}
                >
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Row
        label="Export backup"
        hint={exportDays === null ? 'Download a copy to keep somewhere safe (cloud drive, email to yourself).' : `Last export ${exportDays === 0 ? 'today' : `${exportDays} day${exportDays === 1 ? '' : 's'} ago`}${exportDays > 14 ? ' — time for a fresh one' : ''}.`}
      >
        <div className="flex flex-col gap-2">
          <Button icon={Download} block onClick={() => void doExport()}>Download backup</Button>
          {enc && <Toggle checked={encryptExport} onChange={setEncryptExport} label={<span className="text-[13px]">Encrypt with passcode</span>} />}
        </div>
      </Row>
      <Row label="Import backup" hint="Restore from an Orbit .json backup file.">
        <>
          <Button icon={Upload} block onClick={() => fileRef.current?.click()}>Choose file…</Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void onFile(f)
              e.target.value = ''
            }}
          />
        </>
      </Row>

      <div className="border-t border-line pt-4">
        <p className="mb-2 text-sm font-medium text-ink">Start over</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button size="sm" icon={Sparkles} onClick={() => void replaceWith('demo')}>Load sample data</Button>
          <Button size="sm" icon={HardDriveDownload} onClick={() => void replaceWith('empty')}>Clear records</Button>
          <Button size="sm" variant="ghost" icon={Trash2} className="text-bad" onClick={() => void replaceWith('erase')}>Erase everything</Button>
        </div>
      </div>

      {pending && (
        <Sheet
          open
          size="sm"
          title="Encrypted backup"
          onClose={() => setPending(null)}
          footer={
            <>
              <div className="flex-1" />
              <Button variant="ghost" onClick={() => setPending(null)}>Cancel</Button>
              <Button
                variant="primary"
                onClick={async () => {
                  try {
                    const data = await readBackup(pending.text, passcode)
                    setPending(null)
                    setPasscode('')
                    await applyImport(data)
                  } catch (e) {
                    setImportError(e instanceof Error ? e.message : 'Could not decrypt')
                  }
                }}
              >
                Decrypt
              </Button>
            </>
          }
        >
          <p className="mb-3 text-[13px] text-muted">“{pending.name}” is encrypted. Enter the passcode it was created with.</p>
          <Field error={importError}>
            <Input type="password" value={passcode} onChange={(e) => setPasscode(e.target.value)} placeholder="Passcode" />
          </Field>
        </Sheet>
      )}
    </Section>
  )
}
