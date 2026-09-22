"use client"

import { LargeTitle } from "@/components/ios/nav-header"
import { ListGroup, ListRow } from "@/components/ios/list"
import { SETTINGS_SECTIONS } from "@/components/settings/sections"

/** Settings, Threads-style: a short list, each row opening its own screen. */
export default function SettingsPage() {
  return (
    <div className="space-y-4">
      <LargeTitle title="Settings" back={{ href: "/you", label: "Profile" }} />
      <ListGroup className="cascade">
        {SETTINGS_SECTIONS.map((s) => <ListRow key={s.slug} icon={s.icon} title={s.label} href={`/settings/${s.slug}`} />)}
      </ListGroup>
    </div>
  )
}
