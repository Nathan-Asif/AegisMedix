"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function BottomNav() {
    const pathname = usePathname();

    const isActive = (path: string) => pathname === path;

    const navItems = [
        { href: "/", icon: "home", label: "Home" },
        { href: "/chat", icon: "forum", label: "Chat" },
        { href: "/ai-appointment", icon: "smart_toy", label: "AI", isCenter: true },
        { href: "/profile", icon: "person", label: "Profile" },
        { href: "/settings", icon: "settings", label: "Settings" },
    ];

    return (
        <nav className="fixed bottom-0 left-0 right-0 bg-card-dark/95 backdrop-blur-lg border-t border-white/10 px-6 py-3 z-50">
            <div className="max-w-md mx-auto flex justify-between items-center">
                {navItems.map((item) =>
                    item.isCenter ? (
                        <Link key={item.href} href={item.href} className="relative -top-6">
                            <div
                                className={`size-14 rounded-full flex items-center justify-center shadow-lg border-4 border-black ${isActive(item.href)
                                        ? "bg-primary text-black shadow-primary/40"
                                        : "bg-slate-700 text-white hover:bg-primary hover:text-black"
                                    }`}
                            >
                                <span className="material-symbols-outlined text-3xl">{item.icon}</span>
                            </div>
                        </Link>
                    ) : (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex flex-col items-center gap-1 transition-colors ${isActive(item.href) ? "text-primary" : "text-slate-400 hover:text-white"
                                }`}
                        >
                            <span className={`material-symbols-outlined ${isActive(item.href) ? "filled" : ""}`}>
                                {item.icon}
                            </span>
                            <span className="text-[10px] font-bold uppercase tracking-widest">{item.label}</span>
                        </Link>
                    )
                )}
            </div>
        </nav>
    );
}
