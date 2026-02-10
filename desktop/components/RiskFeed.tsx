"use client";

import { useEffect, useState } from "react";

interface RiskFeedItemData {
    id: string;
    timestamp: string;
    event_type: string;
    title: string;
    description: string;
    status: "CONFIRMED" | "STABLE" | "LOGGED" | "ALERT" | "WARNING";
}

const statusStyles: Record<string, { bg: string; text: string; border: string }> = {
    CONFIRMED: { bg: "bg-primary/10", text: "text-primary", border: "border-primary/20" },
    STABLE: { bg: "bg-blue-400/10", text: "text-blue-400", border: "border-blue-400/20" },
    LOGGED: { bg: "bg-white/5", text: "text-gray-400", border: "border-white/10" },
    ALERT: { bg: "bg-orange-400/10", text: "text-orange-400", border: "border-orange-400/20" },
    WARNING: { bg: "bg-red-400/10", text: "text-red-400", border: "border-red-400/20" },
};

export default function RiskFeed() {
    const [events, setEvents] = useState<RiskFeedItemData[]>([]);
    const [connected, setConnected] = useState(false);

    useEffect(() => {
        const ws = new WebSocket("ws://localhost:8000/ws/risk-feed");

        ws.onopen = () => setConnected(true);
        ws.onclose = () => setConnected(false);
        ws.onerror = () => setConnected(false);

        ws.onmessage = (event) => {
            const data: RiskFeedItemData = JSON.parse(event.data);
            setEvents((prev) => [data, ...prev].slice(0, 20)); // Keep last 20 events
        };

        return () => ws.close();
    }, []);

    return (
        <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2 mb-1">
                <span className="material-symbols-outlined text-primary text-sm">terminal</span>
                <h3 className="text-white text-sm font-bold uppercase tracking-wide">Risk Feed</h3>
                <div className="flex-1 h-[1px] bg-white/10"></div>
                <span className={`text-[10px] ${connected ? "text-green-400" : "text-red-400"}`}>
                    {connected ? "● LIVE" : "○ OFFLINE"}
                </span>
            </div>
            <div className="bg-surface-dark rounded-xl border border-white/5 p-1 max-h-[300px] overflow-y-auto no-scrollbar">
                <ul className="flex flex-col">
                    {events.length === 0 && (
                        <li className="p-4 text-center text-gray-500 text-sm">Waiting for events...</li>
                    )}
                    {events.map((item) => {
                        const style = statusStyles[item.status] || statusStyles.LOGGED;
                        return (
                            <li
                                key={item.id}
                                className="flex gap-3 p-3 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors cursor-default"
                            >
                                <div className="flex flex-col items-center gap-1 pt-1 min-w-[40px]">
                                    <span className="text-[10px] text-gray-500 font-mono">{item.timestamp}</span>
                                    <div className="h-full w-[1px] bg-white/10"></div>
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs font-bold text-white">{item.title}</span>
                                        <span
                                            className={`flex items-center gap-1 text-[10px] font-bold ${style.text} ${style.bg} px-1.5 py-0.5 rounded border ${style.border}`}
                                        >
                                            {item.status === "CONFIRMED" && (
                                                <span className="material-symbols-outlined text-[10px]">check</span>
                                            )}
                                            {item.status}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-400 font-mono">{item.description}</p>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            </div>
        </section>
    );
}
