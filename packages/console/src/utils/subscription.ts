import { useQuery } from "@tanstack/solid-query"
import { api } from "../app"

export function useSubscription() {
  return useQuery(() => ({
    queryKey: ["subscription"],
    queryFn: async () => {
      const res = await api.api.subscriptions.current.$get()
      if (!res.ok) throw new Error("Failed to fetch subscription")
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  }))
}
