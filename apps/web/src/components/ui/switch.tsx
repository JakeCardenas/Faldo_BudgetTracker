"use client"

import * as React from "react"
import { play } from "@/lib/sound"
import { cn } from "@/lib/utils"
import { Switch as SwitchPrimitive } from "radix-ui"

function Switch({
  className,
  size = "default",
  onCheckedChange,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 items-center rounded-full border border-transparent transition-colors duration-200 outline-none group-has-[:focus-visible]/field-label:border-transparent group-has-[:focus-visible]/field-label:ring-0 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[size=default]:h-[22px] data-[size=default]:w-[38px] data-[size=sm]:h-[14px] data-[size=sm]:w-[24px] dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:bg-primary data-unchecked:bg-input dark:data-unchecked:bg-input/80 data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      onCheckedChange={(checked) => { onCheckedChange?.(checked); play(checked ? "toggleOn" : "toggleOff") }}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block rounded-full bg-background ring-0 transition-transform duration-200 ease-[var(--ease-out-quint)] group-data-[size=default]/switch:size-[18px] shadow-[0_1px_2px_rgb(0_0_0/0.15)] group-data-[size=sm]/switch:size-3 group-data-[size=default]/switch:data-checked:translate-x-[calc(100%-1px)] group-data-[size=sm]/switch:data-checked:translate-x-[calc(100%-2px)] dark:data-checked:bg-white group-data-[size=default]/switch:data-unchecked:translate-x-px group-data-[size=sm]/switch:data-unchecked:translate-x-0 dark:data-unchecked:bg-[#d9ddd9]"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
