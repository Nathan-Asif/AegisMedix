"use client";

import Link from "next/link";

interface SubHeaderProps {
    title: string;
    backHref?: string;
    rightAction?: React.ReactNode;
}

export default function SubHeader({ title, backHref = "/", rightAction }: SubHeaderProps) {
    return (
        <div className="bg-card-dark/50 border-b border-white/5">
            <div className="flex items-center justify-between px-4 py-3 max-w-7xl mx-auto">
                <Link
                    href={backHref}
                    className="flex items-center gap-2 text-primary hover:text-primary/80 transition-colors"
                >
                    <span className="material-symbols-outlined">arrow_back</span>
                    <span className="text-sm font-medium">Back</span>
                </Link>
                <h1 className="text-white font-bold text-lg">{title}</h1>
                <div className="min-w-[60px] flex justify-end">
                    {rightAction || <span className="opacity-0">placeholder</span>}
                </div>
            </div>
        </div>
    );
}
