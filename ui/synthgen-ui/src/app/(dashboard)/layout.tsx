"use client";

import { Header } from "@/components/layout/header";
import { useAuth } from "@/contexts/auth-context";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // If not authenticated and not already on the login page, redirect to login
    if (!isAuthenticated && pathname !== "/login") {
      router.push("/login");
    }
  }, [isAuthenticated, router, pathname]);

  // If not authenticated, don't render the dashboard content
  if (!isAuthenticated && pathname !== "/login") {
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col">
      {isAuthenticated && <Header />}
      <main className="flex-1 p-6">
        <div className="container mx-auto">{children}</div>
      </main>
      <footer className="border-t py-4">
        <div className="container mx-auto flex justify-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} SynthGen - Data Generation Framework
        </div>
      </footer>
    </div>
  );
} 