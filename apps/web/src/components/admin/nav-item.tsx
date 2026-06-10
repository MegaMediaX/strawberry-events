"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarDays,
  CheckSquare,
  Users,
  DollarSign,
  UserCog,
  Mail,
  Shield,
  Trash2,
  Settings,
  Key,
  Webhook,
  Puzzle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS = {
  LayoutDashboard,
  CalendarDays,
  CheckSquare,
  Users,
  DollarSign,
  UserCog,
  Mail,
  Shield,
  Trash2,
  Settings,
  Key,
  Webhook,
  Puzzle,
} as const;

export type NavIconName = keyof typeof ICONS;

export function NavItem({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon?: NavIconName;
}) {
  const pathname = usePathname();
  const isActive = href.endsWith("/admin")
    ? pathname === href || pathname === href + "/"
    : pathname.startsWith(href);

  const Icon = icon ? ICONS[icon] : null;

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
        isActive
          ? "bg-primary/10 font-medium text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {Icon && <Icon className="h-4 w-4 shrink-0 opacity-70" />}
      {label}
    </Link>
  );
}
