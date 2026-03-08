"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import SideNav from "~/components/sidebar/SideNav";
import useUser from "~/hooks/useUser";
import { Button } from "~/components/ui/button";
import { Menu } from "lucide-react";
import { NavItems } from "~/components/sidebar/config";
import { cn } from "~/lib/utils";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoading: isLoadingUser, isAuthenticated } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!isLoadingUser && !isAuthenticated) {
      router.push("/sign-in");
    }
  }, [isLoadingUser, isAuthenticated, router]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  if (isLoadingUser) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const navItems = NavItems(pathname);

  return (
    <div
      suppressHydrationWarning
      className="relative flex h-screen w-full overflow-y-hidden"
    >
      <div className="sticky top-0 hidden h-screen md:block">
        <SideNav />
      </div>

      <div className="flex w-full flex-col">
        {/* mobile header */}
        <div className="flex items-center justify-between gap-2 border-b px-4 py-2 md:hidden">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle menu</span>
            </Button>
            <span className="text-primary font-bold">Logik</span>
          </div>
        </div>

        {/* mobile menu dropdown */}
        {mobileMenuOpen && (
          <div className="border-b bg-card p-4 md:hidden">
            <nav className="space-y-1">
              {navItems.map((item) => {
                const isActive = item.active;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {item.icon}
                    {item.name}
                  </Link>
                );
              })}
            </nav>
          </div>
        )}

        <div className="h-full flex-1 overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}
