"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { FaBrain } from "react-icons/fa";
import { ThemeToggle } from "@/components/theme-toggle";
import { API_SECRET_KEY } from "@/lib/config";

export default function LoginPage() {
    const [apiKey, setApiKey] = useState("");
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
            login(API_SECRET_KEY);
            router.push("/dashboard");
        }
    }, [isAuthenticated, login, router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!apiKey.trim()) {
            setError("API Key is required");
            return;
        }

        try {
            login(apiKey.trim());
            router.push("/dashboard");
        } catch (error) {
            console.error("Login error:", error);
            setError(error instanceof Error ? error.message : "Invalid API Key");
        }
    };

    return (
        <div className="flex min-h-screen flex-col items-center justify-center p-6">
            <div className="absolute top-4 right-4">
                <ThemeToggle />
            </div>

            <Card className="w-full max-w-md">
                <CardHeader className="space-y-1">
                    <div className="flex items-center justify-center mb-4">
                        <FaBrain className="h-12 w-12 text-primary" />
                    </div>
                    <CardTitle className="text-2xl text-center">SynthGen Monitoring</CardTitle>
                    <CardDescription className="text-center">
                        Enter your API key to access the monitoring dashboard
                    </CardDescription>
                </CardHeader>
                <form onSubmit={handleSubmit}>
                    <CardContent className="space-y-4 pb-2">
                        <div className="space-y-2 flex flex-col items-center">
                            <div className="relative w-full max-w-3xs">
                                <Input
                                    type="password"
                                    placeholder="Enter your API key"
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                    className="pl-8 text-center h-9"
                                />
                            </div>
                            {error && <p className="text-sm text-destructive mt-2">{error}</p>}
                        </div>
                    </CardContent>
                    <CardFooter className="pt-1 pb-4 flex justify-center">
                        <Button type="submit" className="w-full max-w-3xs h-9">
                            Log In
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
} 