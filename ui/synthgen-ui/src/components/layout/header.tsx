"use client";

import { MainNav } from "./main-nav";
import { ThemeToggle } from "../theme-toggle";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FaSignOutAlt, FaUser } from "react-icons/fa";

export function Header() {
  const { logout } = useAuth();

  return (
    <header className="border-b">
      <div className="container flex h-16 items-center px-4">
        <MainNav />
        <div className="ml-auto flex items-center space-x-4">
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <FaUser className="h-[1.2rem] w-[1.2rem]" />
                <span className="sr-only">User menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={logout} className="cursor-pointer">
                <FaSignOutAlt className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
} 