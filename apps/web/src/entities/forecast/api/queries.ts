"use client"

import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { api } from "@/shared/api/client"
import { keys } from "@/shared/api/query-keys"
import type { Forecast } from "@/shared/api/types"

export function useForecast(horizon: string) {
  return useQuery({ queryKey: keys.forecast(horizon), queryFn: () => api.get<Forecast>("/forecast", { horizon }), placeholderData: keepPreviousData })
}
