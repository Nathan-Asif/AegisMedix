"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import MainHeader from "@/components/MainHeader";
import BottomNav from "@/components/BottomNav";
import SubHeader from "@/components/SubHeader";
import { API_URL, getAuthHeader } from "@/lib/api-config";

interface RecoveryData {
    status: string;
    diagnosis: string;
    start_date: string;
    end_date_estimated: string;
    progress: number;
    medications: any[];
    tasks: any[];
    vitals_trend: any[];
}

export default function RecoveryPage() {
    const { user, loading: authLoading } = useAuth();
    const [patient, setPatient] = useState<any>(null);
    const [schedule, setSchedule] = useState<any[]>([]);
    const [tasks, setTasks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isUpdating, setIsUpdating] = useState(false);
    const [saving, setSaving] = useState(false);
    const [isAddingMed, setIsAddingMed] = useState(false);
    const [formData, setFormData] = useState({
        diagnosis: "",
        recovery_protocol: "",
        recovery_duration_days: 7
    });

    useEffect(() => {
        if (user?.id) {
            fetchRecoveryData();
        }
    }, [user?.id]);

    const fetchRecoveryData = async () => {
        try {
            const headers = getAuthHeader();

            // Fetch patient (for diagnosis/protocol)
            const pRes = await fetch(`${API_URL}/api/patients/${user?.id}`, { headers });
            if (pRes.ok) {
                const data = await pRes.json();
                setPatient(data);
                setFormData({
                    diagnosis: data.diagnosis || "",
                    recovery_protocol: data.recovery_protocol || "",
                    recovery_duration_days: data.recovery_duration_days || 7
                });
            }

            // Fetch schedule
            const sRes = await fetch(`${API_URL}/api/patients/${user?.id}/medications/schedule`, { headers });
            if (sRes.ok) setSchedule(await sRes.json());

            // Fetch tasks
            const tRes = await fetch(`${API_URL}/api/patients/${user?.id}/tasks`, { headers });
            if (tRes.ok) setTasks(await tRes.json());

        } catch (error) {
            console.error("Error fetching recovery data:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateRecovery = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const headers = { ...getAuthHeader(), "Content-Type": "application/json" };
            const res = await fetch(`${API_URL}/api/patients/${user?.id}`, {
                method: "PUT",
                headers,
                body: JSON.stringify({
                    ...formData,
                    recovery_start_date: new Date().toISOString()
                })
            });

            if (res.ok) {
                await fetchRecoveryData();
                setIsUpdating(false);
            }
        } catch (error) {
            console.error("Error updating recovery:", error);
        } finally {
            setSaving(false);
        }
    };

    const handleResetRecovery = async () => {
        if (!confirm("Are you sure you want to reset your recovery progress? This will set Day 1 to today.")) return;
        try {
            const res = await fetch(`${API_URL}/api/patients/${user?.id}/recovery/reset`, {
                method: "PUT",
                headers: getAuthHeader()
            });
            if (res.ok) await fetchRecoveryData();
        } catch (e) {
            console.error(e);
        }
    };

    const handleClearRecovery = async () => {
        if (!confirm("Are you sure you want to delete this recovery track? AI will assume you have fully recovered.")) return;
        try {
            const res = await fetch(`${API_URL}/api/patients/${user?.id}/recovery/clear`, {
                method: "DELETE",
                headers: getAuthHeader()
            });
            if (res.ok) await fetchRecoveryData();
        } catch (e) {
            console.error(e);
        }
    };

    const handleToggleMedication = async (logId: string, currentStatus: string, medId: string) => {
        if (currentStatus === 'TAKEN') {
            // Untake: Delete the log entry
            try {
                const res = await fetch(`${API_URL}/api/medications/log/${logId}`, {
                    method: "DELETE",
                    headers: getAuthHeader()
                });
                if (res.ok) await fetchRecoveryData();
            } catch (e) {
                console.error(e);
            }
            return;
        }

        try {
            const res = await fetch(`${API_URL}/api/medications/log`, {
                method: "POST",
                headers: { ...getAuthHeader(), "Content-Type": "application/json" },
                body: JSON.stringify({ medication_id: medId, patient_id: user?.id })
            });
            if (res.ok) {
                // Optimistic update or refetch
                await fetchRecoveryData();
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleAddManualMedication = async (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const name = (form.elements.namedItem('medName') as HTMLInputElement).value;
        const dosage = (form.elements.namedItem('medDosage') as HTMLInputElement).value;

        if (!name) return;

        try {
            // We use the same 'add and log' logic but maybe exposing a new endpoint is cleaner?
            // Actually, let's just use a direct insert to medications table if we had the endpoint, 
            // but we don't have a direct 'create medication' endpoint exposed in main.py yet except via AI.
            // Wait, we can use the `log_medication` if the med exists, but for NEW meds we need `add_and_log`.
            // Since we can't easily call `add_and_log` from here without a new endpoint, 
            // let's create a temporary convention or just use the AI endpoint? No.
            // Let's rely on the user adding it to their schedule?
            // User requested: "custom form to add medication manually here as well"
            // I'll assume they want to add it to the schedule AND log it. 
            // I'll call a new endpoint I'll add to main.py later, or just reuse `add_and_log_medication` logic via a new route.
            // For now, I'll execute the fetch expecting the endpoint `/api/patients/{id}/medications` to allow POST.
            // Wait, I need to add that endpoint first to main.py. 
            // I will add the UI now and then update backend.
            const res = await fetch(`${API_URL}/api/patients/${user?.id}/medications/log-custom`, { // New endpoint
                method: "POST",
                headers: { ...getAuthHeader(), "Content-Type": "application/json" },
                body: JSON.stringify({ name, dosage })
            });

            if (res.ok) {
                await fetchRecoveryData();
                setIsAddingMed(false);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleDeleteMedication = async (e: React.MouseEvent, medId: string) => {
        e.stopPropagation(); // Prevent toggle
        if (!confirm("Are you sure you want to remove this medication from your schedule?")) return;

        try {
            const res = await fetch(`${API_URL}/api/patients/${user?.id}/medications/${medId}`, {
                method: "DELETE",
                headers: getAuthHeader()
            });

            if (res.ok) {
                await fetchRecoveryData();
            }
        } catch (e) {
            console.error(e);
        }
    };

    if (authLoading || loading) {
        return <div className="min-h-screen bg-black flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;
    }

    // Calculate base time progress
    let baseProgress = patient?.recovery_duration_days && patient?.recovery_start_date
        ? Math.max(0, Math.min(100, Math.round(((new Date().getTime() - new Date(patient.recovery_start_date).getTime()) / (patient.recovery_duration_days * 24 * 60 * 60 * 1000)) * 100)))
        : 0;

    // Calculate medication adherence impact
    let medImpact = 0;
    if (schedule.length > 0) {
        const takenCount = schedule.filter((s: any) => s.status === 'TAKEN').length;
        const adherencePct = (takenCount / schedule.length) * 100;
        // Formula: 85% Time Progress + 15% Med Adherence
        // This means full recovery requires both time passage AND medication adherence
        medImpact = adherencePct * 0.15;
        baseProgress = baseProgress * 0.85;
    }

    const recoveryProgress = Math.round(baseProgress + medImpact);

    return (
        <div className="min-h-screen bg-black text-white flex flex-col">
            <MainHeader />
            <SubHeader title="Recovery Cycle" />

            <main className="flex-1 p-4 max-w-7xl mx-auto w-full space-y-6">

                {/* Recovery Status Card */}
                <div className="bg-card-dark border border-white/5 rounded-2xl p-6 shadow-xl relative overflow-hidden bg-gradient-to-br from-card-dark to-black">
                    <div className="absolute top-0 right-0 p-8 opacity-10">
                        <span className="material-symbols-outlined text-8xl text-primary">healing</span>
                    </div>

                    <div className="relative z-10 space-y-6">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                            <div className="space-y-2">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-primary bg-primary/10 px-3 py-1 rounded-full">Active Recovery</span>
                                <h2 className="text-3xl font-bold tracking-tighter">{patient?.diagnosis || "General Recovery"}</h2>
                                <p className="text-slate-400 text-sm max-w-md line-clamp-2">
                                    Protocol: {patient?.recovery_protocol || "Self-monitored recovery plan with AI assistance."}
                                </p>
                            </div>

                            <div className="flex items-center gap-6">
                                <div className="flex items-center gap-8 pr-6 border-r border-white/10">
                                    <div className="text-center">
                                        <div className="text-2xl font-bold text-white tracking-tighter">{recoveryProgress}%</div>
                                        <div className="text-[10px] text-slate-500 uppercase font-bold">Progress</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-2xl font-bold text-teal-accent tracking-tighter">
                                            {patient?.recovery_duration_days ? `${patient.recovery_duration_days}d` : "N/A"}
                                        </div>
                                        <div className="text-[10px] text-slate-500 uppercase font-bold">Duration</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setIsUpdating(!isUpdating)}
                                        className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-bold uppercase tracking-tighter flex items-center gap-2 transition-all mr-2"
                                    >
                                        <span className="material-symbols-outlined text-sm">{isUpdating ? 'close' : 'edit'}</span>
                                        {isUpdating ? 'Cancel' : 'Update Status'}
                                    </button>

                                    <button
                                        onClick={handleResetRecovery}
                                        className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs transition-all text-slate-400 hover:text-white"
                                        title="Reset Progress (Day 1)"
                                    >
                                        <span className="material-symbols-outlined text-sm">restart_alt</span>
                                    </button>
                                    <button
                                        onClick={handleClearRecovery}
                                        className="p-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg text-xs transition-all text-red-400 hover:text-red-300"
                                        title="Clear/Finish Recovery"
                                    >
                                        <span className="material-symbols-outlined text-sm">delete</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Manual Update Form */}
                        {isUpdating && (
                            <form onSubmit={handleUpdateRecovery} className="bg-black/40 border border-white/10 rounded-xl p-5 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-slate-400 font-bold uppercase">Condition / Illness</label>
                                        <input
                                            type="text"
                                            value={formData.diagnosis}
                                            onChange={(e) => setFormData(f => ({ ...f, diagnosis: e.target.value }))}
                                            placeholder="e.g., Mild Fever, Sprained Ankle"
                                            className="w-full bg-black border border-white/10 rounded-lg p-2.5 text-sm focus:border-primary/50 outline-none transition-all"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-slate-400 font-bold uppercase">Est. Duration (Days)</label>
                                        <input
                                            type="number"
                                            value={formData.recovery_duration_days}
                                            onChange={(e) => setFormData(f => ({ ...f, recovery_duration_days: parseInt(e.target.value) }))}
                                            className="w-full bg-black border border-white/10 rounded-lg p-2.5 text-sm focus:border-primary/50 outline-none transition-all"
                                            required
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-slate-400 font-bold uppercase">Recovery Protocol / Medications</label>
                                    <textarea
                                        value={formData.recovery_protocol}
                                        onChange={(e) => setFormData(f => ({ ...f, recovery_protocol: e.target.value }))}
                                        placeholder="Outline the steps/meds suggested or used..."
                                        rows={3}
                                        className="w-full bg-black border border-white/10 rounded-lg p-2.5 text-sm focus:border-primary/50 outline-none transition-all"
                                        required
                                    />
                                </div>
                                <div className="flex justify-end">
                                    <button
                                        type="submit"
                                        disabled={saving}
                                        className="bg-primary hover:bg-primary/90 text-black font-bold py-2 px-6 rounded-lg text-xs uppercase tracking-wider flex items-center gap-2 transition-all disabled:opacity-50"
                                    >
                                        {saving ? <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span> : <span className="material-symbols-outlined text-sm">check_circle</span>}
                                        {saving ? 'Saving...' : 'Save Manual Update'}
                                    </button>
                                </div>
                            </form>
                        )}

                        <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-primary to-teal-accent transition-all duration-1000"
                                style={{ width: `${recoveryProgress}%` }}
                            ></div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* Medication Adherence */}
                    <div className="lg:col-span-2 bg-card-dark border border-white/5 rounded-2xl p-6 space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="font-bold text-lg flex items-center gap-2">
                                <span className="material-symbols-outlined text-teal-accent">medication</span>
                                Recovery Medication
                            </h3>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-500 font-bold uppercase">{schedule.filter(s => s.status === 'TAKEN').length}/{schedule.length} DOSED TODAY</span>
                                <button onClick={() => setIsAddingMed(!isAddingMed)} className="p-1 bg-white/5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-all">
                                    <span className="material-symbols-outlined text-sm">add</span>
                                </button>
                            </div>
                        </div>

                        {isAddingMed && (
                            <form onSubmit={handleAddManualMedication} className="bg-white/5 border border-white/10 rounded-xl p-4 animate-in fade-in slide-in-from-top-2">
                                <div className="flex gap-2 mb-2">
                                    <input name="medName" placeholder="Medication Name" className="flex-1 bg-black border border-white/10 rounded p-2 text-xs outline-none focus:border-primary/50" required />
                                    <input name="medDosage" placeholder="Dosage (e.g. 500mg)" className="w-24 bg-black border border-white/10 rounded p-2 text-xs outline-none focus:border-primary/50" />
                                </div>
                                <button type="submit" className="w-full bg-teal-accent/10 border border-teal-accent/20 text-teal-accent py-1.5 rounded text-xs font-bold uppercase hover:bg-teal-accent/20 transition-all">
                                    Log & Add to Schedule
                                </button>
                            </form>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {schedule.map((item: any) => (
                                <div
                                    key={item.id}
                                    onClick={() => handleToggleMedication(item.id, item.status, item.medication_id)}
                                    className={`p-4 rounded-xl border transition-all cursor-pointer group ${item.status === 'TAKEN' ? 'bg-teal-500/5 border-teal-500/20' : 'bg-white/5 border-white/10 hover:border-white/20'}`}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <p className={`font-bold ${item.status === 'TAKEN' ? 'text-teal-accent' : 'text-slate-200'}`}>{item.medication?.name || "Unknown Med"}</p>
                                        <div className="flex items-center gap-2">
                                            {item.status === 'TAKEN' ? (
                                                <span className="material-symbols-outlined text-teal-accent text-sm">check_circle</span>
                                            ) : (
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded font-bold">DUE</span>
                                                    <span className="material-symbols-outlined text-slate-600 text-sm group-hover:text-white transition-colors">check_circle</span>
                                                </div>
                                            )}
                                            <button
                                                onClick={(e) => handleDeleteMedication(e, item.medication_id)}
                                                className="text-slate-600 hover:text-red-500 transition-colors z-10"
                                                title="Remove Medication"
                                            >
                                                <span className="material-symbols-outlined text-sm">delete</span>
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex justify-between text-[11px] text-slate-500 font-medium">
                                        <span>{item.medication?.dosage || item.medication?.frequency}</span>
                                        <span>{new Date(item.scheduled_for).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Milestones (Moved to Right Column) */}
                    <div className="bg-card-dark border border-white/5 rounded-2xl p-6 h-fit space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="material-symbols-outlined text-amber-500">flag</span>
                            <h3 className="font-bold text-lg">Milestones</h3>
                        </div>

                        {patient?.diagnosis ? (
                            <div className="space-y-6 relative pl-2">
                                {/* Vertical Line */}
                                <div className="absolute left-[19px] top-2 bottom-2 w-0.5 bg-white/5"></div>

                                {[
                                    { pct: 25, label: "Early Recovery", desc: "Focus on rest & medication adherence." },
                                    { pct: 50, label: "Midway Checkpoint", desc: "Symptoms should be subsiding." },
                                    { pct: 75, label: "Final Stretch", desc: "Energy levels returning to normal." },
                                    { pct: 100, label: "Fully Recovered", desc: "Return to normal activity." }
                                ].map((m) => {
                                    const isReached = recoveryProgress >= m.pct;
                                    return (
                                        <div key={m.pct} className="relative z-10 flex gap-4">
                                            <div className={`mt-1 h-2.5 w-2.5 rounded-full border-2 ${isReached ? 'bg-primary border-primary' : 'bg-black border-slate-700'}`}></div>
                                            <div>
                                                <p className={`text-xs font-bold uppercase tracking-wider ${isReached ? 'text-primary' : 'text-slate-500'}`}>{m.label}</p>
                                                <p className={`text-sm ${isReached ? 'text-slate-200' : 'text-slate-600'}`}>{m.desc}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-center py-8 text-slate-500 italic text-sm">
                                No active recovery milestones.
                            </div>
                        )}
                    </div>

                </div>

                {/* Informational Section */}
                <div className="bg-primary/5 border border-primary/10 rounded-2xl p-6">
                    <div className="flex items-start gap-4">
                        <div className="size-10 bg-primary/20 rounded-full flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-primary">info</span>
                        </div>
                        <div className="space-y-1">
                            <h4 className="font-bold text-sm text-primary">Doctor's Note Integration</h4>
                            <p className="text-xs text-slate-400 leading-relaxed">
                                AegisMedix syncs your recovery protocol with reported sickness. If your AI Medical Sentinel suggests new treatments, they are listed as "AI Suggested" until confirmed via your medical dash or a real consultation. Always follow verified medical advice.
                            </p>
                        </div>
                    </div>
                </div>

            </main>

            <div className="h-20"></div>
            <BottomNav />
        </div>
    );
}
