"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface User {
    id: string;
    email: string;
    full_name: string;
}

interface AuthContextType {
    user: User | null;
    loading: boolean;
    login: (email: string, password: string) => Promise<void>;
    logout: () => void;
    isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Routes that don't require authentication
const PUBLIC_ROUTES = ["/login", "/register"];

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const pathname = usePathname();

    // Check auth status on mount
    useEffect(() => {
        checkAuth();
    }, []);

    // Redirect logic
    useEffect(() => {
        if (!loading) {
            const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

            if (!user && !isPublicRoute) {
                // Not authenticated and trying to access protected route
                router.push("/login");
            } else if (user && isPublicRoute) {
                // Authenticated but on login/register page
                router.push("/");
            }
        }
    }, [user, loading, pathname, router]);

    const checkAuth = async () => {
        try {
            const token = localStorage.getItem("access_token");
            const storedUser = localStorage.getItem("user");

            if (!token) {
                setLoading(false);
                return;
            }

            // Verify token with backend
            const response = await fetch(`${API_URL}/api/auth/verify`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ access_token: token }),
            });

            if (response.ok) {
                const data = await response.json();
                setUser(data.user);
            } else {
                // Token invalid, try refresh
                const refreshToken = localStorage.getItem("refresh_token");
                if (refreshToken) {
                    const refreshed = await refreshAccessToken(refreshToken);
                    if (!refreshed) {
                        clearAuth();
                    }
                } else {
                    clearAuth();
                }
            }
        } catch (error) {
            console.error("Auth check failed:", error);
            clearAuth();
        } finally {
            setLoading(false);
        }
    };

    const refreshAccessToken = async (refreshToken: string): Promise<boolean> => {
        try {
            const response = await fetch(`${API_URL}/api/auth/refresh`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ refresh_token: refreshToken }),
            });

            if (response.ok) {
                const data = await response.json();
                localStorage.setItem("access_token", data.access_token);
                localStorage.setItem("refresh_token", data.refresh_token);
                // Re-verify to get user data
                await checkAuth();
                return true;
            }
            return false;
        } catch {
            return false;
        }
    };

    const login = async (email: string, password: string) => {
        const response = await fetch(`${API_URL}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || "Login failed");
        }

        localStorage.setItem("access_token", data.access_token);
        localStorage.setItem("refresh_token", data.refresh_token);
        localStorage.setItem("user", JSON.stringify(data.user));
        setUser(data.user);
    };

    const logout = () => {
        clearAuth();
        router.push("/login");
    };

    const clearAuth = () => {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        localStorage.removeItem("user");
        setUser(null);
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                loading,
                login,
                logout,
                isAuthenticated: !!user,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}

// Helper to get auth header for API calls
export function getAuthHeader(): { Authorization: string } | {} {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
}
