"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Search, ChevronDown, Settings, LogOut, User } from "lucide-react";
import clsx from "clsx";
import { Badge } from "../ui/Badge";

type TopHeaderProps = {
  title?: string;
};

type UserInfo = {
  id?: string;
  email?: string;
  name?: string;
};

export function TopHeader({ title }: TopHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [searchValue, setSearchValue] = useState("");
  const [notifCount, setNotifCount] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [user, setUser] = useState<UserInfo | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const pageTitle =
    title ??
    pathname
      ?.split("/")
      .filter(Boolean)
      .at(-1)
      ?.replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase()) ??
    "Dashboard";

  useEffect(() => {
    try {
      const raw = localStorage.getItem("matex_user");
      if (raw) setUser(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("matex_token");
    if (!token) return;

    fetch("/api/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        tool: "notifications.get_notifications",
        input: { unread_only: true, limit: 1 },
      }),
    })
      .then((r) => r.json())
      .then((data) => setNotifCount(data?.total_unread ?? 0))
      .catch(() => {/* non-critical */});
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchValue.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchValue.trim())}`);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("matex_token");
    localStorage.removeItem("matex_user");
    router.push("/login");
  };

  const initials = user?.name
    ? user.name
        .split(" ")
        .slice(0, 2)
        .map((n) => n[0])
        .join("")
        .toUpperCase()
    : user?.email?.[0]?.toUpperCase() ?? "U";

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-slate-200 bg-white/95 backdrop-blur-sm px-4 sm:px-6">
      {/* Left: Page title */}
      <div className="w-40 shrink-0 hidden sm:block">
        <h1 className="text-lg font-semibold text-slate-900 truncate">{pageTitle}</h1>
      </div>

      {/* Center: Search */}
      <form onSubmit={handleSearch} className="flex-1 max-w-xl mx-auto">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <input
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            type="search"
            placeholder="Search listings, materials, companies…"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 focus:bg-white transition-colors"
          />
        </div>
      </form>

      {/* Right: Notif + Avatar */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Notification bell */}
        <button
          onClick={() => router.push("/notifications")}
          aria-label="Notifications"
          className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
        >
          <Bell className="h-5 w-5" />
          {notifCount > 0 && (
            <span className="absolute top-1 right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
              {notifCount > 9 ? "9+" : notifCount}
            </span>
          )}
        </button>

        {/* User avatar + dropdown */}
        <div ref={dropdownRef} className="relative">
          <button
            onClick={() => setDropdownOpen((v) => !v)}
            aria-label="User menu"
            aria-expanded={dropdownOpen}
            className="flex items-center gap-1.5 rounded-lg p-1 hover:bg-slate-100 transition-colors"
          >
            <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-semibold">
              {initials}
            </div>
            <ChevronDown
              className={clsx(
                "h-3.5 w-3.5 text-slate-400 transition-transform duration-150 hidden sm:block",
                dropdownOpen && "rotate-180"
              )}
            />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-1 w-52 rounded-xl border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-black/5 z-50">
              {user && (
                <div className="px-3 py-2 border-b border-slate-100">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {user.name ?? "Account"}
                  </p>
                  <p className="text-xs text-slate-500 truncate">{user.email}</p>
                </div>
              )}
              <button
                onClick={() => {
                  setDropdownOpen(false);
                  router.push("/settings");
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Settings className="h-4 w-4 text-slate-400" />
                Settings
              </button>
              <button
                onClick={() => {
                  setDropdownOpen(false);
                  router.push("/profile");
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <User className="h-4 w-4 text-slate-400" />
                My Profile
              </button>
              <div className="my-1 border-t border-slate-100" />
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
