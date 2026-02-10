"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth, getAuthHeader } from "@/lib/auth-context";
import MainHeader from "@/components/MainHeader";
import BottomNav from "@/components/BottomNav";
import SubHeader from "@/components/SubHeader";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface PatientProfile {
    id: string;
    full_name: string;
    email: string;
    avatar_url: string | null;
    recovery_protocol: string | null;
    recovery_start_date: string | null;
    recovery_duration_days: number | null;
    is_vip: boolean;
    phone: string | null;
    date_of_birth: string | null;
    emergency_contact: string | null;
    blood_type: string | null;
    allergies: string | null;
    created_at: string;
}

export default function ProfilePage() {
    const { user, loading: authLoading } = useAuth();
    const [profile, setProfile] = useState<PatientProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [formData, setFormData] = useState({
        full_name: "",
        phone: "",
        emergency_contact: "",
        blood_type: "",
        allergies: "",
        date_of_birth: "",
    });

    useEffect(() => {
        if (user?.id) {
            fetchProfile();
        }
    }, [user?.id]);

    const calculateAge = (dob: string) => {
        if (!dob) return null;
        const birthDate = new Date(dob);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        return age;
    };

    const fetchProfile = async () => {
        try {
            const response = await fetch(`${API_URL}/api/patients/${user?.id}`, {
                headers: { ...getAuthHeader() },
            });
            if (response.ok) {
                const data = await response.json();
                setProfile(data);
                setFormData({
                    full_name: data.full_name || "",
                    phone: data.phone || "",
                    emergency_contact: data.emergency_contact || "",
                    blood_type: data.blood_type || "",
                    allergies: data.allergies || "",
                    date_of_birth: data.date_of_birth || "",
                });
            }
        } catch (error) {
            console.error("Failed to fetch profile:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setSaveError(null);

        try {
            const response = await fetch(`${API_URL}/api/patients/${user?.id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    ...getAuthHeader(),
                },
                body: JSON.stringify(formData),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || "Failed to save profile");
            }

            const result = await response.json();
            setProfile({ ...profile!, ...formData });
            setEditing(false);
        } catch (error) {
            setSaveError(error instanceof Error ? error.message : "Failed to save");
        } finally {
            setSaving(false);
        }
    };

    const handleAvatarClick = () => {
        if (editing) {
            fileInputRef.current?.click();
        }
    };

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            setSaveError("Image must be less than 5MB");
            return;
        }

        setUploadingAvatar(true);
        setSaveError(null);

        try {
            const formData = new FormData();
            formData.append("file", file);

            const response = await fetch(`${API_URL}/api/patients/${user?.id}/avatar`, {
                method: "POST",
                headers: { ...getAuthHeader() },
                body: formData,
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || "Failed to upload avatar");
            }

            const result = await response.json();
            setProfile({ ...profile!, avatar_url: result.avatar_url });
        } catch (error) {
            setSaveError(error instanceof Error ? error.message : "Failed to upload avatar");
        } finally {
            setUploadingAvatar(false);
        }
    };

    if (authLoading || loading) {
        return (
            <div className="min-h-screen bg-black text-white flex flex-col">
                <MainHeader />
                <div className="flex-1 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-4">
                        <span className="material-symbols-outlined text-4xl text-primary animate-pulse">person</span>
                        <p className="text-slate-400">Loading profile...</p>
                    </div>
                </div>
                <BottomNav />
            </div>
        );
    }

    const recoveryProgress = profile?.recovery_start_date && profile?.recovery_duration_days
        ? Math.min(100, Math.round(
            ((Date.now() - new Date(profile.recovery_start_date).getTime()) /
                (profile.recovery_duration_days * 24 * 60 * 60 * 1000)) * 100
        ))
        : 0;

    return (
        <div className="min-h-screen bg-black text-white pb-24">
            <MainHeader />
            <SubHeader
                title="Profile"
                rightAction={
                    <button
                        onClick={() => editing ? handleSave() : setEditing(true)}
                        disabled={saving}
                        className="text-primary text-sm font-bold disabled:opacity-50"
                    >
                        {saving ? "Saving..." : editing ? "Save" : "Edit"}
                    </button>
                }
            />

            <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
                {/* Error Message */}
                {saveError && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400 text-sm flex items-center gap-2">
                        <span className="material-symbols-outlined">error</span>
                        {saveError}
                        <button onClick={() => setSaveError(null)} className="ml-auto">
                            <span className="material-symbols-outlined text-sm">close</span>
                        </button>
                    </div>
                )}

                {/* Avatar & Name Card */}
                <div className="bg-card-dark rounded-xl p-6 border border-white/5 text-center">
                    <div className="relative inline-block">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleAvatarUpload}
                        />
                        <div
                            onClick={handleAvatarClick}
                            className={`size-24 rounded-full bg-cover bg-center border-2 border-primary/30 mx-auto relative ${editing ? "cursor-pointer hover:opacity-80" : ""
                                }`}
                            style={{
                                backgroundImage: `url("${profile?.avatar_url || '/default-avatar.png'}")`,
                            }}
                        >
                            {editing && (
                                <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
                                    {uploadingAvatar ? (
                                        <span className="material-symbols-outlined animate-spin text-white">progress_activity</span>
                                    ) : (
                                        <span className="material-symbols-outlined text-white">photo_camera</span>
                                    )}
                                </div>
                            )}
                        </div>
                        {profile?.is_vip && (
                            <div className="absolute bottom-0 right-0 bg-primary text-black text-[10px] font-bold px-2 py-0.5 rounded-full">
                                VIP
                            </div>
                        )}
                    </div>
                    {editing && (
                        <p className="text-slate-400 text-xs mt-2">Click to upload new photo</p>
                    )}
                    {editing ? (
                        <input
                            type="text"
                            value={formData.full_name}
                            onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                            className="mt-4 w-full max-w-xs mx-auto h-10 px-4 bg-white/5 border border-white/10 rounded-lg text-white text-center"
                        />
                    ) : (
                        <h2 className="text-xl font-bold mt-4">{profile?.full_name || "New Patient"}</h2>
                    )}
                    <p className="text-slate-400 text-sm">{profile?.email}</p>
                    {profile?.recovery_protocol && (
                        <p className="text-primary text-sm mt-1">Recovery Protocol {profile.recovery_protocol}</p>
                    )}
                </div>

                {/* Recovery Progress */}
                {profile?.recovery_start_date && (
                    <div className="bg-card-dark rounded-xl p-6 border border-white/5">
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="text-white font-bold">Recovery Progress</h3>
                            <span className="text-primary font-bold">{recoveryProgress}%</span>
                        </div>
                        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${recoveryProgress}%` }} />
                        </div>
                        <p className="text-slate-400 text-xs mt-2">
                            Started {new Date(profile.recovery_start_date).toLocaleDateString()} • {profile.recovery_duration_days} day program
                        </p>
                    </div>
                )}

                {/* Personal Information */}
                <div className="bg-card-dark rounded-xl p-6 border border-white/5">
                    <h3 className="text-white font-bold mb-4">Personal Information</h3>
                    <div className="space-y-4">
                        <div>
                            <label className="text-slate-400 text-xs uppercase tracking-wider">Phone</label>
                            {editing ? (
                                <input
                                    type="tel"
                                    value={formData.phone}
                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                    className="w-full h-10 px-4 bg-white/5 border border-white/10 rounded-lg text-white mt-1"
                                    placeholder="Enter phone number"
                                />
                            ) : (
                                <p className="text-white mt-1">{profile?.phone || "Not set"}</p>
                            )}
                        </div>
                        <div>
                            <label className="text-slate-400 text-xs uppercase tracking-wider">Date of Birth</label>
                            {editing ? (
                                <input
                                    type="date"
                                    value={formData.date_of_birth}
                                    onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                                    className="w-full h-10 px-4 bg-white/5 border border-white/10 rounded-lg text-white mt-1"
                                    style={{ colorScheme: "dark" }}
                                />
                            ) : (
                                <div className="flex items-center gap-2 mt-1">
                                    <p className="text-white">
                                        {profile?.date_of_birth ? new Date(profile.date_of_birth).toLocaleDateString() : "Not set"}
                                    </p>
                                    {profile?.date_of_birth && (
                                        <span className="bg-white/10 text-slate-300 text-xs px-2 py-0.5 rounded-full">
                                            {calculateAge(profile.date_of_birth)} years old
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                        <div>
                            <label className="text-slate-400 text-xs uppercase tracking-wider">Emergency Contact</label>
                            {editing ? (
                                <input
                                    type="text"
                                    value={formData.emergency_contact}
                                    onChange={(e) => setFormData({ ...formData, emergency_contact: e.target.value })}
                                    className="w-full h-10 px-4 bg-white/5 border border-white/10 rounded-lg text-white mt-1"
                                    placeholder="Name and phone"
                                />
                            ) : (
                                <p className="text-white mt-1">{profile?.emergency_contact || "Not set"}</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Medical Information */}
                <div className="bg-card-dark rounded-xl p-6 border border-white/5">
                    <h3 className="text-white font-bold mb-4">Medical Information</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-slate-400 text-xs uppercase tracking-wider">Blood Type</label>
                            {editing ? (
                                <select
                                    value={formData.blood_type}
                                    onChange={(e) => setFormData({ ...formData, blood_type: e.target.value })}
                                    className="w-full h-10 px-4 bg-[#0D1B2A] border border-white/10 rounded-lg text-white mt-1 appearance-none"
                                    style={{ colorScheme: "dark" }}
                                >
                                    <option value="" className="bg-[#0D1B2A] text-white">Select</option>
                                    <option value="A+" className="bg-[#0D1B2A] text-white">A+</option>
                                    <option value="A-" className="bg-[#0D1B2A] text-white">A-</option>
                                    <option value="B+" className="bg-[#0D1B2A] text-white">B+</option>
                                    <option value="B-" className="bg-[#0D1B2A] text-white">B-</option>
                                    <option value="AB+" className="bg-[#0D1B2A] text-white">AB+</option>
                                    <option value="AB-" className="bg-[#0D1B2A] text-white">AB-</option>
                                    <option value="O+" className="bg-[#0D1B2A] text-white">O+</option>
                                    <option value="O-" className="bg-[#0D1B2A] text-white">O-</option>
                                </select>
                            ) : (
                                <p className="text-white mt-1">{profile?.blood_type || "Not set"}</p>
                            )}
                        </div>
                        <div>
                            <label className="text-slate-400 text-xs uppercase tracking-wider">Member Since</label>
                            <p className="text-white mt-1">
                                {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : "Today"}
                            </p>
                        </div>
                    </div>
                    <div className="mt-4">
                        <label className="text-slate-400 text-xs uppercase tracking-wider">Allergies</label>
                        {editing ? (
                            <textarea
                                value={formData.allergies}
                                onChange={(e) => setFormData({ ...formData, allergies: e.target.value })}
                                className="w-full h-20 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white mt-1 resize-none"
                                placeholder="List any allergies"
                            />
                        ) : (
                            <p className="text-white mt-1">{profile?.allergies || "None reported"}</p>
                        )}
                    </div>
                </div>

                {/* Cancel button when editing */}
                {editing && (
                    <button
                        onClick={() => {
                            setEditing(false);
                            // Reset form data to original profile
                            if (profile) {
                                setFormData({
                                    full_name: profile.full_name || "",
                                    phone: profile.phone || "",
                                    emergency_contact: profile.emergency_contact || "",
                                    blood_type: profile.blood_type || "",
                                    allergies: profile.allergies || "",
                                    date_of_birth: profile.date_of_birth || "",
                                });
                            }
                        }}
                        className="w-full h-12 bg-white/5 border border-white/10 rounded-lg text-slate-400 font-medium hover:text-white transition-colors"
                    >
                        Cancel
                    </button>
                )}
            </main>

            <BottomNav />
        </div>
    );
}
