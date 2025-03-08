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
import { testConnection } from "@/lib/api/services";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, XCircle } from "lucide-react";

export default function LoginPage() {
    const [apiKey, setApiKey] = useState("");
    const [apiUrl, setApiUrl] = useState(getApiUrl());
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [testResult, setTestResult] = useState<{success: boolean; message?: string} | null>(null);
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

    // Clear test results when URL or key changes
    useEffect(() => {
        setTestResult(null);
    }, [apiUrl, apiKey]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setIsLoading(true);
        setTestResult(null);

        if (!apiKey) {
            setError("API Key is required");
            setIsLoading(false);
            return;
        }

        if (!apiUrl) {
            setError("API URL is required");
            setIsLoading(false);
            return;
        }

        try {
            // Test the connection before proceeding
            const result = await testConnection(apiUrl, apiKey);
            setTestResult(result);
            
            if (!result.success) {
                setIsLoading(false);
                return;
            }
            
            // If connection test passed, proceed with login
            setTimeout(() => {
                // Process the login with both API key and URL
                login(apiKey, apiUrl);
                
                // Force a page reload to ensure config picks up the new API URL
                window.location.href = "/dashboard";
            }, 500); // Small delay to show the success message
        } catch (err) {
            console.error("Login error:", err);
            setTestResult({
                success: false,
                message: "Authentication failed. Please check your API key and URL."
            });
            setIsLoading(false);
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
                                testResult.success ? 'bg-background border-border' : 'bg-destructive/10 border-destructive/20 text-destructive'
                            }`}>
                                {testResult.success ? 
                                    <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" /> : 
                                    <XCircle className="h-5 w-5 flex-shrink-0" />
                                }
                                <p className="leading-5">
                                    {testResult.success 
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
                            {isLoading ? (testResult?.success ? "Logging in..." : "Testing connection...") : "Login"}
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