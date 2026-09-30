"use client"

import { LargeTitle } from "@/shared/ui/ios/nav-header"
import { ListGroup, ListRow } from "@/shared/ui/ios/list"
import { SETTINGS_SECTIONS } from "@/widgets/settings"
import { useMaskedAmounts } from "@/shared/lib/privacy"

/** Settings, Threads-style: a short list, each row opening its own screen. */
export default function SettingsPage() {
  useMaskedAmounts()
  return (
    <div className="space-y-4">
      <LargeTitle title="Settings" back={{ href: "/you", label: "Profile" }} />
      <ListGroup className="cascade">
        {SETTINGS_SECTIONS.map((s) => <ListRow key={s.slug} icon={s.icon} title={s.label} href={`/settings/${s.slug}`} />)}
      </ListGroup>
    </div>
  )
}
