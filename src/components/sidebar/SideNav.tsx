"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, LogOut } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { NavItems } from "./config";
import { cn } from "~/lib/utils";
import { useAtom } from "jotai";
import { usePathname, useRouter } from "next/navigation";
import { sidebarExpandedAtom } from "~/store/atom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { FullWidthThemeSwitcher } from "~/components/ui/theme-switcher";
import useUser from "~/hooks/useUser";

export default function SideNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [isSidebarExpanded, setIsSidebarExpanded] =
    useAtom(sidebarExpandedAtom);
  const [isClient, setIsClient] = useState(false);

  const { user, isLoading: isLoadingUser, isAdmin, signOut } = useUser();

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (isLoadingUser) return <SideNavSkeleton />;
  if (!user) return null;

  const navItems = NavItems(pathname, isAdmin);

  const toggleSidebar = () => {
    setIsSidebarExpanded(!isSidebarExpanded);
  };

  if (!isClient) {
    return null;
  }

  return (
    <div className="relative">
      <div
        className={cn(
          isSidebarExpanded ? "w-[240px]" : "w-[60px]",
          "bg-background border-border hidden h-screen flex-col border-r transition-all duration-300 ease-in-out sm:flex"
        )}
      >
        {/* logo */}
        <div className="flex h-14 items-center justify-center border-b border-border/50 px-3">
          {isSidebarExpanded ? (
            <div className="flex items-center gap-2">
              <svg
                width="32"
                height="32"
                viewBox="0 0 32 32"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="shrink-0"
              >
                <rect width="32" height="32" rx="8" className="fill-primary" />
                <path
                  d="M8 12h16M8 16h16M8 20h16"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  className="stroke-primary-foreground/40"
                />
                <path
                  d="M10 10l6 3-6 3V10z"
                  className="fill-primary-foreground"
                />
                <circle cx="22" cy="13" r="2.5" className="fill-primary-foreground/80" />
                <path
                  d="M18 19l4 4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  className="stroke-primary-foreground/60"
                />
              </svg>
              <span className="text-base font-semibold tracking-tight">Logistix</span>
            </div>
          ) : (
            <svg
              width="32"
              height="32"
              viewBox="0 0 32 32"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect width="32" height="32" rx="8" className="fill-primary" />
              <path
                d="M8 12h16M8 16h16M8 20h16"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                className="stroke-primary-foreground/40"
              />
              <path
                d="M10 10l6 3-6 3V10z"
                className="fill-primary-foreground"
              />
              <circle cx="22" cy="13" r="2.5" className="fill-primary-foreground/80" />
              <path
                d="M18 19l4 4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                className="stroke-primary-foreground/60"
              />
            </svg>
          )}
        </div>

        {/* nav items */}
        <div className="flex flex-1 flex-col gap-1 p-2">
          {navItems.map((item, idx) => (
            <Fragment key={idx}>
              <SideNavItem
                label={item.name}
                icon={item.icon}
                path={item.href}
                active={pathname === item.href}
                isSidebarExpanded={isSidebarExpanded}
                onClick={() => router.push(item.href)}
              />
            </Fragment>
          ))}
        </div>

        {/* profile section */}
        <div className="border-t border-border/50 p-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                "flex w-full items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted/50",
                !isSidebarExpanded && "justify-center"
              )}
            >
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="bg-muted text-xs">
                  {user?.name
                    ?.split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {isSidebarExpanded && (
                <div className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-medium">{user?.name}</p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {user?.email}
                  </p>
                </div>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[200px]">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium">{user?.name}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
              <DropdownMenuSeparator />
              <div className="p-1">
                <FullWidthThemeSwitcher />
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* collapse button */}
        <button
          type="button"
          className="absolute -right-3 top-20 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background shadow-sm transition-colors hover:bg-muted"
          onClick={toggleSidebar}
        >
          {isSidebarExpanded ? (
            <ChevronLeft size={14} className="text-muted-foreground" />
          ) : (
            <ChevronRight size={14} className="text-muted-foreground" />
          )}
        </button>
      </div>
    </div>
  );
}

const SideNavItem: React.FC<{
  label: string;
  icon: React.ReactNode;
  path: string;
  active: boolean;
  isSidebarExpanded: boolean;
  onClick?: () => void;
}> = ({ label, icon, path, active, isSidebarExpanded, onClick }) => {
  if (isSidebarExpanded) {
    return (
      <Link
        href={path}
        onClick={onClick}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
          active
            ? "bg-primary/10 text-primary font-medium"
            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        )}
      >
        {icon}
        <span>{label}</span>
      </Link>
    );
  }

  return (
    <TooltipProvider disableHoverableContent>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <Link
            href={path}
            onClick={onClick}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            )}
          >
            {icon}
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={10}>
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

function SideNavSkeleton() {
  return (
    <div className="bg-background border-border hidden h-screen w-[240px] animate-pulse border-r sm:flex flex-col">
      <div className="flex h-14 items-center justify-center border-b border-border/50 px-3">
        <div className="h-8 w-8 rounded-lg bg-muted" />
        <div className="ml-2 h-5 w-16 rounded bg-muted" />
      </div>
      <div className="flex-1 space-y-1 p-2">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="h-10 w-full rounded-lg bg-muted" />
        ))}
      </div>
      <div className="border-t border-border/50 p-2">
        <div className="h-12 w-full rounded-lg bg-muted" />
      </div>
    </div>
  );
}
