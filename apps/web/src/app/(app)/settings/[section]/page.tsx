"use client"

import { notFound, useParams } from "next/navigation"
import { LargeTitle } from "@/components/ios/nav-header"
import { SETTINGS_SECTIONS } from "@/components/settings/sections"
import { useMe } from "@/lib/queries"

export default function SettingsSectionPage() {
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
