import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="space-y-4 pt-16 lg:pt-10">
      <Skeleton className="h-9 w-56" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}</div>
      <Skeleton className="h-80 rounded-xl" />
    </div>
  )
}
