"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface AuthContextType {
    apiKey: string;
    apiUrl: string;
    isAuthenticated: boolean;
    login: (key: string, url: string) => void;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [apiKey, setApiKey] = useState<string>("");
    const [apiUrl, setApiUrl] = useState<string>("");
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

    useEffect(() => {
        // Check if there's a stored API key in localStorage
        const storedApiKey = localStorage.getItem('api_key');
        const storedApiUrl = localStorage.getItem('api_url');
        if (storedApiKey) {
            setApiKey(storedApiKey);
            setIsAuthenticated(true);
        }
        if (storedApiUrl) {
            setApiUrl(storedApiUrl);
        }
    }, []);

    const login = (key: string, url: string) => {
        setApiKey(key);
        setApiUrl(url);
        setIsAuthenticated(true);
        localStorage.setItem('api_key', key);
        localStorage.setItem('api_url', url);
    };

    const logout = () => {
        setApiKey("");
        setApiUrl("");
        setIsAuthenticated(false);
        localStorage.removeItem('api_key');
        localStorage.removeItem('api_url');
    };

    return (
        <AuthContext.Provider value={{ apiKey, apiUrl, isAuthenticated, login, logout }}>
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