"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { FaBrain, FaChartBar, FaChartLine, FaClipboardList, FaHome, FaTasks } from "react-icons/fa";

export function MainNav() {
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
    {
      href: "/analytics",
      label: "Analytics",
      icon: <FaChartBar className="mr-2 h-4 w-4" />,
      active: pathname === "/analytics",
    },
    {
      href: "/tasks",
      label: "Tasks",
      icon: <FaTasks className="mr-2 h-4 w-4" />,
      active: pathname === "/tasks" || pathname?.startsWith("/tasks/"),
    },
    {
      href: "/reports",
      label: "Reports",
      icon: <FaChartLine className="mr-2 h-4 w-4" />,
      active: pathname === "/reports",
    },
  ];

  return (
    <nav className="flex items-center space-x-4 lg:space-x-6">
      <Link href="/dashboard" className="flex items-center space-x-2">
        <FaBrain className="h-6 w-6" />
        <span className="font-bold text-xl">SynthGen</span>
      </Link>
      <div className="ml-10 flex items-center space-x-4 lg:space-x-6">
        {routes.map((route) => (
          <Link
            key={route.href}
            href={route.href}
            className={cn(
              "flex items-center text-sm font-medium transition-colors hover:text-primary",
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
    </nav>
  );
} 