// Device helpers — mostly about behaving like a native app on iPhone.

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  // iPadOS reports itself as a Mac; touch support gives it away.
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/** Running from the Home Screen (installed), not inside a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Save a file. On iPhone/iPad this opens the share sheet (Save to Files, AirDrop,
 * Mail, iCloud Drive…); elsewhere it downloads.
 */
export async function saveFile(blob: Blob, filename: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  if (isIOS() && typeof File !== 'undefined' && navigator.canShare) {
    const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' })
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename })
        return 'shared'
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
        // NotAllowedError etc. — fall back to a regular download.
      }
    }
  }
  download(blob, filename)
  return 'downloaded'
}
