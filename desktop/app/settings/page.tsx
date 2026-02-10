"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import MainHeader from "@/components/MainHeader";
import BottomNav from "@/components/BottomNav";
import SubHeader from "@/components/SubHeader";
import Link from "next/link";
import { API_URL, getAuthHeader } from "@/lib/api-config";

export default function SettingsPage() {
    const { user, logout, loading: authLoading } = useAuth();
    const [patient, setPatient] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [notifications, setNotifications] = useState({
        medicationReminders: true,
        emailReminders: false,
        appointmentAlerts: true,
        healthUpdates: true,
    });
    const [emergencyNumber, setEmergencyNumber] = useState("911");

    useState(() => {
        if (user?.id) {
            fetchSettings();
        }
    });

    const fetchSettings = async () => {
        try {
            const headers = getAuthHeader();
            const res = await fetch(`${API_URL}/api/patients/${user?.id}`, { headers });
            if (res.ok) {
                const data = await res.json();
                setPatient(data);
                setEmergencyNumber(data.emergency_number || "911");
                setNotifications({
                    medicationReminders: data.in_app_reminders_enabled ?? true,
                    emailReminders: data.email_reminders_enabled ?? false,
                    appointmentAlerts: true,
                    healthUpdates: true,
                });
            }
        } catch (error) {
            console.error("Error fetching settings:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const headers = { ...getAuthHeader(), "Content-Type": "application/json" };
            const res = await fetch(`${API_URL}/api/patients/${user?.id}`, {
                method: "PUT",
                headers,
                body: JSON.stringify({
                    emergency_number: emergencyNumber,
                    email_reminders_enabled: notifications.emailReminders,
                    in_app_reminders_enabled: notifications.medicationReminders
                })
            });
            if (res.ok) {
                alert("Settings saved successfully!");
            }
        } catch (error) {
            console.error("Error saving settings:", error);
        } finally {
            setSaving(false);
        }
    };

    if (authLoading || loading) {
        return (
            <div className="min-h-screen bg-black text-white flex flex-col">
                <MainHeader />
                <div className="flex-1 flex items-center justify-center">
                    <span className="material-symbols-outlined text-4xl text-primary animate-pulse">settings</span>
                </div>
                <BottomNav />
            </div>
        );
    }

    const SettingToggle = ({ label, description, checked, onChange }: {
        label: string;
        description?: string;
        checked: boolean;
        onChange: () => void;
    }) => (
        <div className="flex items-center justify-between py-3">
            <div>
                <p className="text-white font-medium">{label}</p>
                {description && <p className="text-slate-400 text-sm">{description}</p>}
            </div>
            <button
                onClick={onChange}
                className={`w-12 h-6 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-white/10'}`}
            >
                <div className={`size-5 bg-white rounded-full transition-transform ${checked ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
        </div>
    );

    const SettingLink = ({ icon, label, href, danger }: {
        icon: string;
        label: string;
        href?: string;
        danger?: boolean;
    }) => (
        <Link
            href={href || "#"}
            className={`flex items-center justify-between py-3 ${danger ? 'text-red-400' : 'text-white'}`}
        >
            <div className="flex items-center gap-3">
                <span className={`material-symbols-outlined ${danger ? 'text-red-400' : 'text-slate-400'}`}>{icon}</span>
                <span className="font-medium">{label}</span>
            </div>
            <span className="material-symbols-outlined text-slate-500">chevron_right</span>
        </Link>
    );

    return (
        <div className="min-h-screen bg-black text-white pb-24">
            <MainHeader />
            <SubHeader title="Settings" />

            <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">

                {/* Save Button Floating */}
                <div className="flex justify-end">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-6 py-2 bg-primary text-black font-bold rounded-lg hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center gap-2"
                    >
                        {saving ? <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span> : <span className="material-symbols-outlined text-sm">save</span>}
                        {saving ? "Saving..." : "Save Changes"}
                    </button>
                </div>

                {/* Account Section */}
                <div className="bg-card-dark rounded-xl p-6 border border-white/5">
                    <h2 className="text-slate-400 text-xs uppercase tracking-wider mb-4">Account</h2>
                    <div className="flex items-center gap-4 pb-4 border-b border-white/5">
                        <div
                            className="size-14 rounded-full bg-cover bg-center border border-primary/30"
                            style={{ backgroundImage: `url('${patient?.avatar_url || '/default-avatar.png'}')` }}
                        />
                        <div>
                            <p className="font-bold">{patient?.full_name || user?.full_name || "Patient"}</p>
                            <p className="text-slate-400 text-sm">{user?.email}</p>
                        </div>
                    </div>
                </div>

                {/* Emergency Section */}
                <div className="bg-card-dark rounded-xl p-6 border border-red-500/10">
                    <div className="flex items-center gap-2 mb-4 text-red-400">
                        <span className="material-symbols-outlined text-sm">sos</span>
                        <h2 className="text-xs uppercase tracking-wider">Emergency SOS</h2>
                    </div>
                    <div className="space-y-4">
                        <div className="space-y-1">
                            <label className="text-slate-400 text-xs font-bold uppercase">SOS Number</label>
                            <input
                                type="text"
                                value={emergencyNumber}
                                onChange={(e) => setEmergencyNumber(e.target.value)}
                                placeholder="Local emergency number (e.g., 911)"
                                className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-sm focus:border-red-500/50 outline-none transition-all"
                            />
                            <p className="text-[10px] text-slate-500 mt-1">This number will be dialed when you tap the SOS button in the header.</p>
                        </div>
                    </div>
                </div>

                {/* Notifications Section */}
                <div className="bg-card-dark rounded-xl p-6 border border-white/5">
                    <h2 className="text-slate-400 text-xs uppercase tracking-wider mb-4">Notifications</h2>
                    <div className="divide-y divide-white/5">
                        <SettingToggle
                            label="Medication Reminders"
                            description="In-app alerts for your scheduled meds"
                            checked={notifications.medicationReminders}
                            onChange={() => setNotifications(s => ({ ...s, medicationReminders: !s.medicationReminders }))}
                        />
                        <SettingToggle
                            label="Email Reminders"
                            description="Get email reminders (via SMTP) for critical doses"
                            checked={notifications.emailReminders}
                            onChange={() => setNotifications(s => ({ ...s, emailReminders: !s.emailReminders }))}
                        />
                        <SettingToggle
                            label="Health Updates"
                            description="AI insights and recovery milestones"
                            checked={notifications.healthUpdates}
                            onChange={() => setNotifications(s => ({ ...s, healthUpdates: !s.healthUpdates }))}
                        />
                    </div>
                </div>

                {/* Version */}
                <p className="text-center text-slate-500 text-xs mt-8">
                    AegisMedix v0.4.5 • Made with ❤️ for better health
                </p>
            </main>

            <BottomNav />
        </div>
    );
}
