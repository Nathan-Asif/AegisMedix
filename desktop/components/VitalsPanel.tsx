"use client";

import { useEffect, useState } from "react";

interface VitalsData {
    heart_rate: number;
    adherence_score: number;
    oxygen_level: number;
}

export default function VitalsPanel() {
    const [vitals, setVitals] = useState<VitalsData | null>(null);
    const [connected, setConnected] = useState(false);

    useEffect(() => {
        const ws = new WebSocket("ws://localhost:8000/ws/vitals");

        ws.onopen = () => setConnected(true);
        ws.onclose = () => setConnected(false);
        ws.onerror = () => setConnected(false);

        ws.onmessage = (event) => {
            const data: VitalsData = JSON.parse(event.data);
            setVitals(data);
        };

        return () => ws.close();
    }, []);

    return (
        <section className="grid grid-cols-2 gap-3">
            {/* Adherence Card */}
            <div className="bg-surface-dark rounded-xl p-4 border border-white/5 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-2 opacity-10">
                    <span className="material-symbols-outlined text-4xl text-primary">verified_user</span>
                </div>
                <p className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-1">Adherence</p>
                <div className="flex items-baseline gap-2">
                    <h3 className="text-3xl font-bold text-white">
                        {vitals?.adherence_score ?? "--"}
                        <span className="text-lg text-primary">%</span>
                    </h3>
                    <span className="text-[10px] text-green-400 font-mono">▲ 2%</span>
                </div>
                <div className="w-full bg-white/10 h-1 rounded-full mt-3 overflow-hidden">
                    <div
                        className="bg-primary h-full rounded-full transition-all duration-500"
                        style={{ width: `${vitals?.adherence_score ?? 0}%` }}
                    ></div>
                </div>
            </div>

            {/* Heart Rate Card */}
            <div className="bg-surface-dark rounded-xl p-4 border border-white/5 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-2 opacity-10">
                    <span className="material-symbols-outlined text-4xl text-red-400">favorite</span>
                </div>
                <p className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-1">Heart Rate</p>
                <div className="flex items-baseline gap-2">
                    <h3 className="text-3xl font-bold text-white">
                        {vitals?.heart_rate ?? "--"}{" "}
                        <span className="text-lg text-gray-400 font-medium text-sm">BPM</span>
                    </h3>
                </div>
                <p className="text-[10px] text-gray-400 mt-2 font-mono">
                    O₂: {vitals?.oxygen_level ?? "--"}%
                </p>
            </div>
        </section>
    );
}
