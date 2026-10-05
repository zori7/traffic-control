import { ApiError, apiFetch } from '@/lib/api'

import type { Credentials, User } from './types'

export async function fetchMe(): Promise<User | null> {
  try {
    return await apiFetch<User>('/auth/me')
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null
    throw error
  }
}

export function loginRequest(credentials: Credentials): Promise<User> {
  return apiFetch<User>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  })
}

export function registerRequest(credentials: Credentials): Promise<User> {
  return apiFetch<User>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(credentials),
  })
}

export function logoutRequest(): Promise<void> {
  return apiFetch<void>('/auth/logout', { method: 'POST' })
}