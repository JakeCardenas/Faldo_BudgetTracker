"use client"

import { notFound, useParams } from "next/navigation"
import { LargeTitle } from "@/shared/ui/ios/nav-header"
import { SETTINGS_SECTIONS } from "@/widgets/settings"
import { useMaskedAmounts } from "@/shared/lib/privacy"
import { useMe } from "@/entities/session"

export default function SettingsSectionPage() {
  useMaskedAmounts()
  const { section } = useParams<{ section: string }>()
  const { data: me } = useMe()
  const entry = SETTINGS_SECTIONS.find((s) => s.slug === section)
  if (!entry) notFound()
  if (!me) return null
  const { Section } = entry
  return (
    <div className="space-y-4">
      <LargeTitle title={entry.label} back={{ href: "/settings", label: "Settings" }} />
      <Section me={me} />
    </div>
  )
}
