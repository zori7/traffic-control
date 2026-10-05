import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, useMemo, type ReactNode } from 'react'

import { fetchMe, loginRequest, logoutRequest, registerRequest } from './api'
import type { Credentials, User } from './types'

interface AuthContextValue {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (credentials: Credentials) => Promise<User>
  register: (credentials: Credentials) => Promise<User>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const ME_KEY = ['auth', 'me'] as const

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()

  const meQuery = useQuery({
    queryKey: ME_KEY,
    queryFn: fetchMe,
    retry: false,
    staleTime: 60_000,
  })

  const loginMutation = useMutation({
    mutationFn: loginRequest,
    onSuccess: (user) => queryClient.setQueryData(ME_KEY, user),
  })

  const registerMutation = useMutation({
    mutationFn: registerRequest,
    onSuccess: (user) => queryClient.setQueryData(ME_KEY, user),
  })

  const logoutMutation = useMutation({
    mutationFn: logoutRequest,
    onSettled: () => {
      queryClient.setQueryData(ME_KEY, null)
      queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] !== 'auth',
      })
    },
  })

  const value = useMemo<AuthContextValue>(
    () => ({
      user: meQuery.data ?? null,
      isLoading: meQuery.isLoading,
      isAuthenticated: Boolean(meQuery.data),
      login: (credentials) => loginMutation.mutateAsync(credentials),
      register: (credentials) => registerMutation.mutateAsync(credentials),
      logout: async () => {
        await logoutMutation.mutateAsync()
      },
    }),
    [meQuery.data, meQuery.isLoading, loginMutation, registerMutation, logoutMutation],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}