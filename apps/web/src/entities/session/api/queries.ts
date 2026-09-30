"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/shared/api/client"
import { keys } from "@/shared/api/query-keys"
import type { Me } from "@/shared/api/types"

export function useMe() {
  return useQuery({ queryKey: keys.me, queryFn: () => api.get<Me>("/me"), staleTime: 60_000, retry: false })
}

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Me["settings"]> & { display_name?: string }) => api.patch<Me>("/me/settings", data),
    onSuccess: (me) => {
      qc.setQueryData(keys.me, me)
      void qc.invalidateQueries({ queryKey: keys.engagement })
    },
  })
}
