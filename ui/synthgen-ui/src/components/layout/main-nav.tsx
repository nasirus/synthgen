"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { FaClipboardList, FaHome, FaBars } from "react-icons/fa";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface MainNavProps {
  className?: string;
}

export function MainNav({ className }: MainNavProps) {
  const pathname = usePathname();

  const routes = [
    {
      href: "/dashboard",
      label: "Dashboard",
      icon: <FaHome className="mr-2 h-4 w-4" />,
      active: pathname === "/dashboard",
    },
    {
      href: "/batches",
      label: "Batches",
      icon: <FaClipboardList className="mr-2 h-4 w-4" />,
      active: pathname === "/batches" || pathname?.startsWith("/batches/"),
    },
  ];

  return (
    <div className={cn("flex w-full items-center", className)}>
      {/* Logo - always visible */}
      <Link href="/dashboard" className="flex items-center space-x-2 shrink-0">
        <span className="font-bold text-xl">SynthGen</span>
      </Link>

      {/* Mobile Navigation Menu */}
      <div className="md:hidden ml-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon">
              <FaBars className="h-4 w-4" />
              <span className="sr-only">Menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {routes.map((route) => (
              <DropdownMenuItem key={route.href} asChild>
                <Link
                  href={route.href}
                  className={cn(
                    "flex w-full items-center",
                    route.active ? "font-medium" : ""
                  )}
                >
                  {route.icon}
                  {route.label}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Desktop Navigation Links */}
      <div className="hidden md:flex md:ml-10 items-center space-x-4 lg:space-x-6">
        {routes.map((route) => (
          <Link
            key={route.href}
            href={route.href}
            className={cn(
              "flex items-center text-sm font-medium transition-colors hover:text-primary whitespace-nowrap",
              route.active
                ? "text-foreground"
                : "text-muted-foreground"
            )}
          >
            {route.icon}
            {route.label}
          </Link>
        ))}
      </div>
    </div>
  );
} 