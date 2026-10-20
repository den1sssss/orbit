import { Component, type ReactNode } from 'react'
import { TriangleAlert } from 'lucide-react'

/** Keeps a crash in one screen from taking down the whole app. Data is untouched. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    // Navigating to another screen clears the error.
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  componentDidCatch(error: Error) {
    console.error('Screen crashed', error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="mx-auto flex max-w-sm flex-col items-center py-20 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-bad-soft text-bad">
          <TriangleAlert size={22} />
        </div>
        <h2 className="text-lg font-semibold">This screen hit a problem</h2>
        <p className="mt-1 text-sm text-muted">Your data is safe. Reload to try again, or switch to another screen.</p>
        <button
          type="button"
          onClick={() => location.reload()}
          className="mt-5 h-10 rounded-xl bg-accent px-4 text-sm font-medium text-accent-ink hover:bg-accent-hover"
        >
          Reload
        </button>
      </div>
    )
  }
}
