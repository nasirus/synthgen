"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface AuthContextType {
    apiKey: string;
    isAuthenticated: boolean;
    login: (key: string) => void;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [apiKey, setApiKey] = useState<string>("");
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

    useEffect(() => {
        // Check if there's a stored API key in localStorage
        const storedApiKey = localStorage.getItem('api_key');
        if (storedApiKey) {
            setApiKey(storedApiKey);
            setIsAuthenticated(true);
        }
    }, []);

    const login = (key: string) => {
        setApiKey(key);
        setIsAuthenticated(true);
        localStorage.setItem('api_key', key);
    };

    const logout = () => {
        setApiKey("");
        setIsAuthenticated(false);
        localStorage.removeItem('api_key');
    };

    return (
        <AuthContext.Provider value={{ apiKey, isAuthenticated, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}; 