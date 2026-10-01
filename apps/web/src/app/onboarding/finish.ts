/**
 * Finishing setup: save that it's done, and only then leave. If saving fails, the person stays on the same step with
 * everything they entered and a reason they can act on; the busy state ends either way.
 *
 * No runtime imports, so it runs under the web tests as it is.
 */
export interface FinishSteps<T> {
  /** Tell the server setup is done. */
  save: () => Promise<T>
  /** Keep what the server answered (the updated account). */
  saved: (result: T) => void
  /** Go to Home or the chat. */
  leave: () => void
  setBusy: (busy: boolean) => void
  setError: (message: string | null) => void
  /** Words for a failure. */
  explain: (error: unknown) => string
}

/** Returns whether setup was saved (and the person left). */
export async function finishSetup<T>(steps: FinishSteps<T>): Promise<boolean> {
  steps.setBusy(true)
  steps.setError(null)
  try {
    steps.saved(await steps.save())
    steps.leave()
    return true
  } catch (error) {
    steps.setError(steps.explain(error))
    return false
  } finally {
    steps.setBusy(false)
  }
}
