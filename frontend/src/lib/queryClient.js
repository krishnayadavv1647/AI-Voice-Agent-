import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data considered fresh for 60s — revisiting a page within this window
      // renders instantly from cache with no refetch.
      staleTime: 60 * 1000,
      // Keep unused data in cache for 5 min before garbage collection.
      gcTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1
    }
  }
});
