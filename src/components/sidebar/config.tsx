import React from "react";
import {
  LayoutDashboard,
  ScrollText,
  Map,
  Package,
  MessageCircle,
  Headphones,
} from "lucide-react";

interface NavItem {
  name: string;
  href: string;
  icon: React.ReactNode;
  active: boolean;
  position: "top" | "bottom";
}

export const NavItems = (pathname: string, isAdmin?: boolean): NavItem[] => {
  function isNavItemActive(nav: string) {
    return pathname === nav || pathname.startsWith(nav + "/");
  }

  if (isAdmin) {
    return [
      {
        name: "Dashboard",
        href: "/admin",
        icon: <LayoutDashboard size={20} />,
        active: pathname === "/admin",
        position: "top",
      },
      {
        name: "Logs",
        href: "/admin/logs",
        icon: <ScrollText size={20} />,
        active: isNavItemActive("/admin/logs"),
        position: "top",
      },
      {
        name: "Live Map",
        href: "/admin/map",
        icon: <Map size={20} />,
        active: isNavItemActive("/admin/map"),
        position: "top",
      },
      {
        name: "Support",
        href: "/admin/support",
        icon: <Headphones size={20} />,
        active: isNavItemActive("/admin/support"),
        position: "top",
      },
    ];
  }

  return [
    {
      name: "Dashboard",
      href: "/",
      icon: <LayoutDashboard size={20} />,
      active: pathname === "/",
      position: "top",
    },
    {
      name: "Track",
      href: "/track",
      icon: <Package size={20} />,
      active: isNavItemActive("/track"),
      position: "top",
    },
    {
      name: "Support",
      href: "/support",
      icon: <MessageCircle size={20} />,
      active: isNavItemActive("/support"),
      position: "top",
    },
  ];
};
