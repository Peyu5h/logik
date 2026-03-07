"use client";

import * as React from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

export function ThemeSwitcher() {
  const { setTheme, theme } = useTheme();

  return (
    <div className="w-full">
      <DropdownMenu>
        <DropdownMenuTrigger asChild className="w-full cursor-pointer">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Sun className="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
            <Moon className="absolute h-[1.2rem] w-[1.2rem] scale-0 -rotate-90 transition-all dark:scale-100 dark:rotate-0" />
            <span className="sr-only">Toggle theme</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[200px]">
          <DropdownMenuItem onClick={() => setTheme("light")}>
            <Sun className="mr-2 h-4 w-4" />
            <span>Light</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("dark")}>
            <Moon className="mr-2 h-4 w-4" />
            <span>Dark</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function FullWidthThemeSwitcher() {
  const { setTheme, theme } = useTheme();

  return (
    <div className="w-full space-y-1">
      <div className="text-muted-foreground px-2 py-1 text-xs font-medium">
        Theme
      </div>
      <div className="space-y-1">
        <button
          onClick={() => setTheme("light")}
          className={`flex w-full items-center rounded-md px-2 py-2 text-sm transition-colors ${
            theme === "light"
              ? "bg-accent text-accent-foreground"
              : "hover:bg-accent/50"
          }`}
        >
          <Sun className="mr-2 h-4 w-4" />
          <span>Light</span>
        </button>
        <button
          onClick={() => setTheme("dark")}
          className={`flex w-full items-center rounded-md px-2 py-2 text-sm transition-colors ${
            theme === "dark"
              ? "bg-accent text-accent-foreground"
              : "hover:bg-accent/50"
          }`}
        >
          <Moon className="mr-2 h-4 w-4" />
          <span>Dark</span>
        </button>
      </div>
    </div>
  );
}
