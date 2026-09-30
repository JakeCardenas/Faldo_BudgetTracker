"use client"

import { LineChart, ReceiptText, Settings, ShoppingBag, CircleUserRound, Wallet } from "lucide-react"
import { MoneyOwedIcon } from "@/shared/ui/category-icon"
import { IosSheet } from "@/shared/ui/ios/sheet"
import { ListGroup, ListRow } from "@/shared/ui/ios/list"
import { YOU_GROUPS, type NavItem } from "@/shared/config/nav"

/** Home's quick actions carry the few things people do most; everything else Faldo does is one tap away here. */
const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Plan",
    items: [
      { href: "/plan/money", label: "Money plan", icon: Wallet },
      { href: "/bills", label: "Bills and recurring", icon: ReceiptText },
      { href: "/debts", label: "Money owed", icon: MoneyOwedIcon },
      { href: "/plan/purchases", label: "Planned purchases", icon: ShoppingBag },
      { href: "/forecast", label: "Forecast", icon: LineChart },
    ],
  },
  ...YOU_GROUPS,
  {
    label: "You",
    items: [
      { href: "/you", label: "Profile", icon: CircleUserRound },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
]

export function MoreSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <IosSheet open={open} onOpenChange={onOpenChange} title="More" description="Everything else Faldo can do." size="sm">
      <div className="space-y-5">
        {GROUPS.map((group) => (
          <ListGroup key={group.label} title={group.label}>
            {group.items.map((item) => <ListRow key={item.href} icon={item.icon} title={item.label} href={item.href} />)}
          </ListGroup>
        ))}
      </div>
    </IosSheet>
  )
}
