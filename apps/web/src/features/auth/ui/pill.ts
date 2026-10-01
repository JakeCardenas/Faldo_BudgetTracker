// Plain strings with no "use client", so server pages (the start page) can use them as they are.

/** The sign-in screens' full-width pill button: deep Faldo green, or a softer look for "or" choices. */
export const PILL = "pressable flex h-12 w-full items-center justify-center gap-2.5 rounded-[0.875rem] text-[0.9375rem] font-semibold transition-colors disabled:opacity-60"
export const PRIMARY_PILL = `${PILL} bg-primary text-primary-foreground hover:bg-primary/90`
