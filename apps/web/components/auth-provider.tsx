"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react"

import { auth as authApi, setAccessToken, type User } from "@/lib/api"

interface AuthState {
  user: User | null
  roles: string[]
  permissions: string[]
  isLoading: boolean
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  hasPermission: (perm: string) => boolean
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [roles, setRoles] = useState<string[]>([])
  const [permissions, setPermissions] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const loadUser = useCallback(async () => {
    try {
      const data = await authApi.me()
      setUser(data.user)
      setRoles(data.roles)
      setPermissions(data.permissions)
    } catch {
      setUser(null)
      setRoles([])
      setPermissions([])
    }
  }, [])

  useEffect(() => {
    const init = async () => {
      try {
        const data = await authApi.refresh()
        setAccessToken(data.access_token)
        await loadUser()
      } catch {
        // No valid session
      } finally {
        setIsLoading(false)
      }
    }
    init()
  }, [loadUser])

  const login = useCallback(
    async (username: string, password: string) => {
      const data = await authApi.login(username, password)
      setAccessToken(data.access_token)
      await loadUser()
    },
    [loadUser]
  )

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } finally {
      setAccessToken(null)
      setUser(null)
      setRoles([])
      setPermissions([])
    }
  }, [])

  const hasPermission = useCallback(
    (perm: string) => permissions.includes(perm),
    [permissions]
  )

  return (
    <AuthContext.Provider
      value={{
        user,
        roles,
        permissions,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        hasPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
