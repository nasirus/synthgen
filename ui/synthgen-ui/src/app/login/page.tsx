"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { FaBrain } from "react-icons/fa";
import { ThemeToggle } from "@/components/theme-toggle";
import { getApiUrl } from "@/lib/config";
import { testConnection } from "@/lib/api/services";
import { CheckCircle2, XCircle } from "lucide-react";
import { TokenResponse } from "@/lib/types";

export default function LoginPage() {
    const [apiKey, setApiKey] = useState("");
    const [apiUrl, setApiUrl] = useState(getApiUrl());
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [testResult, setTestResult] = useState<{token: TokenResponse | null; message?: string} | null>(null);
    const { login, isAuthenticated } = useAuth();
    const router = useRouter();

    // Redirect to dashboard if already authenticated
    useEffect(() => {
        if (isAuthenticated) {
            router.replace("/dashboard");
            return;
        }
    }, [isAuthenticated, router]);

    // Clear test results when URL or key changes
    useEffect(() => {
        setTestResult(null);
        setError("");
    }, [apiUrl, apiKey]);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setError("");
        setIsLoading(true);
        setTestResult(null);

        if (!apiKey) {
            setError("API Key is required");
            setIsLoading(false);
            return false;
        }

        if (!apiUrl) {
            setError("API URL is required");
            setIsLoading(false);
            return false;
        }

        // Validate URL format
        try {
            new URL(apiUrl);
        } catch {
            setError("Please enter a valid URL");
            setIsLoading(false);
            return false;
        }

        try {
            // Test the connection with provided credentials
            const result = await testConnection(apiKey, apiUrl);
            
            if (!result?.token?.isValid) {
                setTestResult({
                    token: { isValid: false },
                    message: result.message || "Invalid credentials. Please check your API key and URL."
                });
                setIsLoading(false);
                return false;
            }
            
            setTestResult({
                token: { isValid: true },
                message: "Connection successful! Logging in..."
            });

            // If connection test passed, proceed with login
            login(apiKey, apiUrl);
            
            // Only redirect after successful login
            setTimeout(() => {
                router.replace("/dashboard");
            }, 500);

        } catch (err) {
            console.error("Login error:", err);
            setTestResult({
                token: { isValid: false },
                message: "Connection failed. Please check your API URL and try again."
            });
            setIsLoading(false);
        }
        
        return false;
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
                                placeholder="http://localhost:8000"
                                value={apiUrl}
                                onChange={(e) => setApiUrl(e.target.value)}
                                className="w-full"
                                disabled={isLoading}
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
                                disabled={isLoading}
                            />
                        </div>
                        
                        {testResult && (
                            <div className={`p-4 rounded-lg border text-sm flex items-start gap-3 ${
                                testResult.token?.isValid ? 'bg-background border-border' : 'bg-destructive/10 border-destructive/20 text-destructive'
                            }`}>
                                {testResult.token?.isValid ? 
                                    <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" /> : 
                                    <XCircle className="h-5 w-5 flex-shrink-0" />
                                }
                                <p className="leading-5">
                                    {testResult.token?.isValid 
                                        ? "Connection successful! Logging in..." 
                                        : testResult.message || "Connection failed"}
                                </p>
                            </div>
                        )}
                        
                        {error && <p className="text-sm text-destructive">{error}</p>}
                        
                        <Button 
                            type="submit" 
                            className="w-full" 
                            disabled={isLoading}
                        >
                            {isLoading ? (testResult?.token ? "Logging in..." : "Testing connection...") : "Login"}
                        </Button>
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