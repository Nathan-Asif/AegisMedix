"use client";

import { useAuth } from "@/lib/auth-context";
import NotificationDropdown from "./NotificationDropdown";
import Link from "next/link";

export default function MainHeader() {
    const { user, logout } = useAuth();

    return (
        <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-md border-b border-white/10">
            <div className="flex items-center p-4 justify-between max-w-7xl mx-auto">
                <Link href="/" className="flex items-center gap-2">
                    <img src="/logo.png" alt="AegisMedix" className="h-20" />
                </Link>
                <div className="flex items-center gap-2">
                    <div className="hidden sm:flex items-center bg-teal-accent/10 px-3 py-1 rounded-full border border-teal-accent/20">
                        <span className="size-2 bg-teal-accent rounded-full status-pulse mr-2"></span>
                        <span className="text-teal-accent text-[10px] font-bold tracking-widest uppercase">System Online</span>
                    </div>
                    {user?.id && (
                        <div className="flex items-center gap-2 mr-2">
                            <a
                                href="tel:911"
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500 hover:text-white transition-all group shadow-lg shadow-red-500/5"
                                title="Emergency SOS"
                            >
                                <span className="material-symbols-outlined text-sm animate-pulse">sos</span>
                                <span className="text-[10px] font-bold tracking-widest uppercase hidden md:inline">SOS</span>
                            </a>
                        </div>
                    )}
                    {user?.id && <NotificationDropdown patientId={user.id} />}
                    <button
                        onClick={logout}
                        className="flex size-10 items-center justify-center rounded-lg bg-transparent text-slate-400 hover:text-red-400 transition-colors"
                        title="Logout"
                    >
                        <span className="material-symbols-outlined">logout</span>
                    </button>
                </div>
            </div>
        </header>
    );
}
