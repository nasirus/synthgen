"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { FaBrain } from "react-icons/fa";
import { ThemeToggle } from "@/components/theme-toggle";
import { API_SECRET_KEY, getApiUrl } from "@/lib/config";

export default function LoginPage() {
    const [apiKey, setApiKey] = useState("");
    const [apiUrl, setApiUrl] = useState(getApiUrl());
    const [error, setError] = useState("");
    const { login, isAuthenticated } = useAuth();
    const router = useRouter();

    // Redirect to dashboard if already authenticated
    useEffect(() => {
        if (isAuthenticated) {
            router.push("/dashboard");
        }
    }, [isAuthenticated, router]);

    // Auto-login with API_SECRET_KEY from env if available
    useEffect(() => {
        if (API_SECRET_KEY && !isAuthenticated) {
            // Don't auto-login anymore, we need the API URL from the user
            // Instead, just pre-fill the API key field
            setApiKey(API_SECRET_KEY);
        }
    }, [isAuthenticated]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (!apiKey) {
            setError("API Key is required");
            return;
        }

        if (!apiUrl) {
            setError("API URL is required");
            return;
        }

        try {
            // Process the login with both API key and URL
            login(apiKey, apiUrl);
            
            // Force a page reload to ensure config picks up the new API URL
            window.location.href = "/dashboard";
        } catch (err) {
            console.error("Login error:", err);
            setError("Authentication failed. Please check your API key and URL.");
        }
    };

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
            <div className="absolute top-4 right-4">
                <ThemeToggle />
            </div>
            
            <Card className="w-full max-w-md">
                <CardHeader className="space-y-1 flex flex-col items-center">
                    <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary mb-2">
                        <FaBrain className="w-6 h-6 text-primary-foreground" />
                    </div>
                    <CardTitle className="text-2xl text-center">SynthGen Monitoring</CardTitle>
                    <CardDescription className="text-center">
                        Enter your API key and URL to access the monitoring dashboard
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <label htmlFor="apiUrl" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                API URL
                            </label>
                            <Input
                                id="apiUrl"
                                placeholder="http://localhost"
                                value={apiUrl}
                                onChange={(e) => setApiUrl(e.target.value)}
                                className="w-full"
                            />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="apiKey" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                API Key
                            </label>
                            <Input
                                id="apiKey"
                                type="password"
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                className="w-full"
                            />
                        </div>
                        {error && <p className="text-sm text-destructive">{error}</p>}
                        <Button type="submit" className="w-full">Login</Button>
                    </form>
                </CardContent>
                <CardFooter className="flex justify-center">
                    <p className="text-xs text-muted-foreground">
                        SynthGen Framework © {new Date().getFullYear()}
                    </p>
                </CardFooter>
            </Card>
        </div>
    );
} 