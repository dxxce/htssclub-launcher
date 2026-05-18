"use client";

import { Home, Library, Settings, Film, User, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

const navItems = [
  { icon: Home, label: "Home", href: "/" },
  { icon: Search, label: "Khám phá", href: "#" },
  { icon: Film, label: "Phim", href: "#" },
  { icon: Library, label: "Thư viện", href: "#" },
];

const bottomNavItems = [
  { icon: User, label: "Hồ sơ", href: "#" },
  { icon: Settings, label: "Cài đặt", href: "#" },
];

export function Sidebar() {
  const [active, setActive] = useState("Home");

  return (
    <div className="w-64 h-full bg-neutral-900/80 backdrop-blur-md border-r border-neutral-800 flex flex-col p-4 flex-shrink-0">
      {/* Logo Area */}
      <div className="flex items-center gap-3 px-2 py-4 mb-6">
        <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
          <Film className="w-5 h-5 text-white" />
        </div>
        <span className="text-xl font-bold text-white tracking-wide">
          HTSS Club
        </span>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.label;
          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={() => setActive(item.label)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${
                isActive
                  ? "bg-purple-600/10 text-purple-400"
                  : "text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200"
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? "text-purple-500" : ""}`} />
              <span className="font-medium text-sm">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom Navigation */}
      <div className="space-y-2 mt-auto pt-4 border-t border-neutral-800/50">
        {bottomNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.label;
          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={() => setActive(item.label)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${
                isActive
                  ? "bg-purple-600/10 text-purple-400"
                  : "text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200"
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? "text-purple-500" : ""}`} />
              <span className="font-medium text-sm">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
