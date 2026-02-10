"use client";

import { useEffect, useState } from "react";
import { useAuth, getAuthHeader } from "@/lib/auth-context";
import MainHeader from "@/components/MainHeader";
import BottomNav from "@/components/BottomNav";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface PatientData {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  recovery_protocol: string | null;
  recovery_start_date: string | null;
  recovery_duration_days: number | null;
  current_diagnosis: string | null;
  emergency_number: string | null;
  is_vip: boolean;
}

interface VitalsData {
  heart_rate: number;
  heart_rate_status: string;
  spo2_level: number;
  spo2_status: string;
  sleep_hours: number;
  sleep_status: string;
}

interface Activity {
  id: string;
  event_type: string;
  title: string;
  description: string;
  severity: string;
  created_at: string;
}

interface Medication {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  scheduled_time: string;
}

interface ScheduleItem {
  id: string;
  medication_id: string;
  status: string; // TAKEN, MISSED, SKIPPED, UPCOMING
  scheduled_for: string;
  medications: Medication;
}

interface Task {
  id: string;
  title: string;
  description: string;
  status: string; // PENDING, COMPLETED
  assigned_by: string; // AI, SELF
  created_at: string;
}

export default function Home() {
  const { user, loading: authLoading, logout, isAuthenticated } = useAuth();
  const [patient, setPatient] = useState<PatientData | null>(null);
  const [vitals, setVitals] = useState<VitalsData | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");

  // Fetch dashboard data on load and when window gains focus
  useEffect(() => {
    if (user?.id) {
      fetchDashboardData();

      // Add focus listener for auto-refresh
      const handleFocus = () => {
        console.log("Window focused - refreshing dashboard data");
        fetchDashboardData();
      };

      window.addEventListener('focus', handleFocus);
      return () => window.removeEventListener('focus', handleFocus);
    }
  }, [user?.id]);

  const fetchDashboardData = async () => {
    try {
      const headers = { ...getAuthHeader() };

      // Fetch patient profile
      const patientRes = await fetch(`${API_URL}/api/patients/${user?.id}`, { headers });
      if (patientRes.ok) {
        setPatient(await patientRes.json());
      } else {
        // New user - set defaults
        setPatient({
          id: user?.id || "",
          full_name: user?.full_name || "New Patient",
          email: user?.email || "",
          avatar_url: null,
          recovery_protocol: null,
          recovery_start_date: null,
          recovery_duration_days: null,
          current_diagnosis: null,
          emergency_number: null,
          is_vip: false,
        });
      }

      // Fetch vitals
      const vitalsRes = await fetch(`${API_URL}/api/patients/${user?.id}/vitals`, { headers });
      if (vitalsRes.ok) {
        setVitals(await vitalsRes.json());
      } else {
        setVitals(null);
      }

      // Fetch schedule (meds)
      const scheduleRes = await fetch(`${API_URL}/api/patients/${user?.id}/medications/schedule`, { headers });
      if (scheduleRes.ok) {
        setSchedule(await scheduleRes.json());
      }

      // Fetch tasks
      const tasksRes = await fetch(`${API_URL}/api/patients/${user?.id}/tasks`, { headers });
      if (tasksRes.ok) {
        setTasks(await tasksRes.json());
      }

      // Fetch activity logs
      const activityRes = await fetch(`${API_URL}/api/patients/${user?.id}/activity?limit=5`, { headers });
      if (activityRes.ok) {
        setActivities(await activityRes.json());
      }
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
    } finally {
      setDataLoading(false);
    }
  };

  const handleMarkTaken = async (medicationId: string) => {
    if (!user?.id) return;
    try {
      const headers = { ...getAuthHeader(), "Content-Type": "application/json" };
      const res = await fetch(`${API_URL}/api/medications/log`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          medication_id: medicationId,
          patient_id: user.id
        })
      });

      if (res.ok) {
        // Refresh data
        fetchDashboardData();
      }
    } catch (error) {
      console.error("Error logging medication:", error);
    }
  };

  const handleCompleteTask = async (taskId: string) => {
    if (!user?.id) return;
    try {
      const headers = { ...getAuthHeader(), "Content-Type": "application/json" };
      const res = await fetch(`${API_URL}/api/tasks/${taskId}/status?status=COMPLETED`, {
        method: "PUT",
        headers
      });

      if (res.ok) {
        fetchDashboardData();
      }
    } catch (error) {
      console.error("Error completing task:", error);
    }
  };

  const handleAddQuickTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id || !newTaskTitle.trim()) return;

    try {
      const headers = { ...getAuthHeader(), "Content-Type": "application/json" };
      const res = await fetch(`${API_URL}/api/patients/${user?.id}/tasks`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: newTaskTitle,
          assigned_by: "SELF"
        })
      });

      if (res.ok) {
        setNewTaskTitle("");
        setIsAddingTask(false);
        fetchDashboardData();
      }
    } catch (error) {
      console.error("Error adding task:", error);
    }
  };

  // Show loading state while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <img src="/logo.png" alt="AegisMedix" className="h-20 animate-pulse" />
          <p className="text-slate-400 text-sm">Loading AegisMedix...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  // Calculate recovery progress
  const recoveryProgress = patient?.recovery_start_date && patient?.recovery_duration_days
    ? Math.max(0, Math.min(100, Math.round(
      ((Date.now() - new Date(patient.recovery_start_date).getTime()) /
        (patient.recovery_duration_days * 24 * 60 * 60 * 1000)) * 100
    )))
    : 0;

  const recoveryDays = patient?.recovery_start_date
    ? Math.max(0, Math.floor((Date.now() - new Date(patient.recovery_start_date).getTime()) / (24 * 60 * 60 * 1000)))
    : 0;

  return (
    <div className="bg-black text-white min-h-screen pb-24">
      <MainHeader />

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* MetaText / Status (Mobile Visibility) */}
        <div className="sm:hidden flex justify-center">
          <div className="flex items-center bg-teal-accent/5 px-4 py-1.5 rounded-full border border-teal-accent/20">
            <span className="size-1.5 bg-teal-accent rounded-full status-pulse mr-2"></span>
            <p className="text-teal-accent text-[10px] font-bold tracking-widest uppercase">
              Sentinel Monitoring Active
            </p>
          </div>
        </div>

        {/* ProfileHeader & Progress Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-card-dark rounded-xl p-6 border border-white/5 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none group-hover:opacity-20 transition-opacity">
              <span className="material-symbols-outlined text-6xl">clinical_notes</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-6 relative z-10">
              <div className="relative">
                <div
                  className="bg-center bg-no-repeat aspect-square bg-cover rounded-full h-24 w-24 border-2 border-primary/30"
                  style={{
                    backgroundImage: `url("${patient?.avatar_url || '/default-avatar.png'}")`,
                  }}
                ></div>
                {patient?.is_vip && (
                  <div className="absolute bottom-0 right-0 bg-primary text-black text-[10px] font-bold px-2 py-0.5 rounded-full border-2 border-card-dark">
                    VIP
                  </div>
                )}
              </div>
              <div className="flex flex-col grow">
                <h1 className="text-white text-2xl font-bold tracking-tight">{patient?.full_name || user?.full_name || "Patient"}</h1>
                <p className="text-primary text-sm font-medium">
                  {patient?.recovery_protocol ? `Recovery Protocol ${patient.recovery_protocol}` : "No active protocol"}
                </p>
                {/* ProgressBar Internal */}
                <Link href="/recovery" className="mt-4 flex flex-col gap-2 hover:opacity-80 transition-opacity flex-1">
                  <div className="flex justify-between items-end">
                    <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">Recovery Cycle</p>
                    <p className="text-white text-xs font-bold uppercase">
                      {patient?.recovery_start_date
                        ? `Day ${recoveryDays} of ${patient.recovery_duration_days || 30}`
                        : "Not started"}
                    </p>
                  </div>
                  <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${recoveryProgress}%` }}></div>
                  </div>
                </Link>
              </div>
              <Link
                href="/profile"
                className="flex items-center justify-center gap-2 rounded-lg h-10 px-6 bg-white/5 text-white text-sm font-bold border border-white/10 hover:bg-primary hover:text-black transition-colors"
              >
                <span className="material-symbols-outlined text-sm">edit</span>
                <span>Manage Profile</span>
              </Link>
            </div>
          </div>

          {/* AegisMedix Sentinel Card */}
          <Link href="/ai-appointment" className="bg-primary rounded-xl p-6 flex flex-col justify-between shadow-lg shadow-primary/20 relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 opacity-10">
              <span className="material-symbols-outlined text-9xl text-black">videocam</span>
            </div>
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-black">smart_toy</span>
                <p className="text-black text-xs font-bold uppercase tracking-widest">AegisMedix Sentinel</p>
              </div>
              <p className="text-black text-lg font-bold leading-tight mb-4">
                Ready for your daily check-in session.
              </p>
            </div>
            <div className="relative z-10 w-full py-3 bg-black text-white rounded-lg font-bold text-sm flex items-center justify-center gap-2 group-hover:bg-slate-900 transition-colors">
              <span className="material-symbols-outlined">video_call</span>
              Start AI Session
            </div>
          </Link>
        </div>

        {/* Medical Status Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Heart Rate */}
          <div className="bg-card-dark border border-white/5 p-4 rounded-xl flex flex-col gap-3">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2 text-slate-400">
                <span className="material-symbols-outlined text-rose-500">favorite</span>
                <span className="text-xs font-bold uppercase tracking-tighter">Heart Rate</span>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${vitals?.heart_rate_status === "STABLE"
                ? "bg-teal-accent/10 text-teal-accent"
                : vitals?.heart_rate_status === "ELEVATED"
                  ? "bg-amber-500/10 text-amber-500"
                  : "bg-white/10 text-slate-400"
                }`}>
                {vitals?.heart_rate_status || "N/A"}
              </span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold text-white tracking-tighter">{vitals?.heart_rate || "--"}</span>
              <span className="text-slate-400 text-xs font-medium">BPM</span>
            </div>
            <div className="h-10 w-full mt-auto opacity-50">
              <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 20">
                <path
                  d="M0,10 Q5,5 10,10 T20,10 T30,10 T40,15 T50,5 T60,10 T70,10 T80,5 T90,10 T100,8"
                  fill="none"
                  stroke="#2DD4BF"
                  strokeWidth="1.5"
                />
              </svg>
            </div>
          </div>

          {/* O2 Saturation */}
          <div className="bg-card-dark border border-white/5 p-4 rounded-xl flex flex-col gap-3">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2 text-slate-400">
                <span className="material-symbols-outlined text-sky-500">water_drop</span>
                <span className="text-xs font-bold uppercase tracking-tighter">SpO2 Level</span>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${vitals?.spo2_status === "OPTIMAL"
                ? "bg-teal-accent/10 text-teal-accent"
                : vitals?.spo2_status === "LOW"
                  ? "bg-red-500/10 text-red-500"
                  : "bg-white/10 text-slate-400"
                }`}>
                {vitals?.spo2_status || "N/A"}
              </span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold text-white tracking-tighter">{vitals?.spo2_level || "--"}</span>
              <span className="text-slate-400 text-xs font-medium">%</span>
            </div>
            <div className="h-10 w-full mt-auto opacity-50">
              <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 20">
                <path
                  d="M0,12 Q10,12 20,10 T40,10 T60,12 T80,11 T100,12"
                  fill="none"
                  stroke="#0ea5e9"
                  strokeWidth="1.5"
                />
              </svg>
            </div>
          </div>

          {/* Sleep Quality */}
          <div className="bg-card-dark border border-white/5 p-4 rounded-xl flex flex-col gap-3">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2 text-slate-400">
                <span className="material-symbols-outlined text-primary">bedtime</span>
                <span className="text-xs font-bold uppercase tracking-tighter">Sleep Score</span>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${vitals?.sleep_status === "GOOD"
                ? "bg-primary/10 text-primary"
                : vitals?.sleep_status === "FAIR"
                  ? "bg-amber-500/10 text-amber-500"
                  : "bg-white/10 text-slate-400"
                }`}>
                {vitals?.sleep_status || "N/A"}
              </span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold text-white tracking-tighter">{vitals?.sleep_hours || "--"}</span>
              <span className="text-slate-400 text-xs font-medium">HOURS</span>
            </div>
            <div className="h-10 w-full mt-auto opacity-50">
              <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 20">
                <path
                  d="M0,18 L10,18 L10,10 L20,10 L20,15 L30,15 L30,5 L40,5 L40,12 L50,12 L50,8 L60,8 L70,18 L80,18 L90,18 L100,18"
                  fill="none"
                  stroke="#d5c07b"
                  strokeWidth="1.5"
                />
              </svg>
            </div>
          </div>
        </div>

        {/* Schedule & Log */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Today's Schedule */}
          <div className="bg-card-dark border border-white/5 rounded-xl overflow-hidden flex flex-col h-full">
            <div className="p-4 border-b border-white/5 flex justify-between items-center bg-white/5">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm uppercase tracking-widest text-slate-400">Today&apos;s Schedule</h3>
                <button
                  onClick={() => setIsAddingTask(!isAddingTask)}
                  className="size-6 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20 transition-colors"
                  title="Add Task"
                >
                  <span className="material-symbols-outlined text-sm">add</span>
                </button>
              </div>
              <span className="text-[10px] text-primary font-bold">
                {dataLoading ? "..." : `${schedule.filter(s => s.status === 'UPCOMING').length + tasks.filter(t => t.status === 'PENDING').length} PENDING`}
              </span>
            </div>

            <div className="p-4 flex-1 overflow-y-auto max-h-[500px]">
              {isAddingTask && (
                <form onSubmit={handleAddQuickTask} className="mb-4 p-3 bg-white/5 rounded-lg border border-primary/20 animate-in fade-in slide-in-from-top-2">
                  <input
                    type="text"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    placeholder="What needs to be done?"
                    className="w-full bg-transparent border-none text-sm text-white placeholder:text-slate-500 focus:ring-0 p-0 mb-2"
                    autoFocus
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsAddingTask(false)}
                      className="px-2 py-1 text-[10px] uppercase font-bold text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!newTaskTitle.trim()}
                      className="px-2 py-1 text-[10px] uppercase font-bold bg-primary text-black rounded hover:bg-primary/80 transition-colors disabled:opacity-50"
                    >
                      Add Task
                    </button>
                  </div>
                </form>
              )}

              {dataLoading ? (
                <div className="text-center py-8 text-slate-400">
                  <span className="material-symbols-outlined animate-spin">progress_activity</span>
                </div>
              ) : (schedule.length === 0 && tasks.length === 0) ? (
                <div className="text-center py-8">
                  <span className="material-symbols-outlined text-4xl text-slate-600">event_available</span>
                  <p className="text-slate-400 mt-2 text-sm">No scheduled tasks</p>
                  <p className="text-slate-500 text-xs">Tasks will appear here once assigned</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Medications */}
                  {schedule.map((item) => (
                    <div key={item.id} className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${item.status === 'TAKEN' ? 'bg-teal-500/5 border-teal-500/20' : 'bg-black/20 border-white/5'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`size-8 rounded-full flex items-center justify-center ${item.status === 'TAKEN' ? 'bg-teal-500/10 text-teal-500' : 'bg-white/5 text-slate-400'}`}>
                          <span className="material-symbols-outlined text-sm">medication</span>
                        </div>
                        <div>
                          <p className={`font-bold text-sm ${item.status === 'TAKEN' ? 'text-teal-500' : 'text-slate-200'}`}>{item.medications?.name || "Medication"}</p>
                          <p className="text-xs text-slate-500">
                            {new Date(item.scheduled_for).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {item.medications?.dosage}
                          </p>
                        </div>
                      </div>

                      {item.status === 'UPCOMING' ? (
                        <button
                          onClick={() => handleMarkTaken(item.medication_id)}
                          className="size-8 rounded-full flex items-center justify-center hover:bg-teal-500/20 text-slate-500 hover:text-teal-500 transition-colors"
                          title="Mark as Taken"
                        >
                          <span className="material-symbols-outlined">check_circle</span>
                        </button>
                      ) : (
                        <span className="text-[10px] font-bold text-teal-500 px-2 py-1 bg-teal-500/10 rounded">
                          {item.status}
                        </span>
                      )}
                    </div>
                  ))}
                  {/* General Tasks */}
                  {tasks.map((task) => (
                    <div key={task.id} className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${task.status === 'COMPLETED' ? 'bg-primary/5 border-primary/20' : 'bg-black/20 border-white/5'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`size-8 rounded-full flex items-center justify-center ${task.status === 'COMPLETED' ? 'bg-primary/10 text-primary' : 'bg-white/5 text-slate-400'}`}>
                          <span className="material-symbols-outlined text-sm">
                            {task.assigned_by === 'AI' ? 'smart_toy' : 'person'}
                          </span>
                        </div>
                        <div>
                          <p className={`font-bold text-sm ${task.status === 'COMPLETED' ? 'text-primary' : 'text-slate-200'}`}>{task.title}</p>
                          <p className="text-xs text-slate-500">
                            Assigned by {task.assigned_by === 'AI' ? 'Dr. Aegis' : 'You'}
                          </p>
                        </div>
                      </div>

                      {task.status === 'PENDING' ? (
                        <button
                          onClick={() => handleCompleteTask(task.id)}
                          className="size-8 rounded-full flex items-center justify-center hover:bg-primary/20 text-slate-500 hover:text-primary transition-colors"
                          title="Mark as Done"
                        >
                          <span className="material-symbols-outlined">task_alt</span>
                        </button>
                      ) : (
                        <span className="text-[10px] font-bold text-primary px-2 py-1 bg-primary/10 rounded">
                          DONE
                        </span>
                      )}
                    </div>
                  ))}
                </div>

              )}
            </div>
          </div>

          {/* Activity Log */}
          <div className="bg-card-dark border border-white/5 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-white/5">
              <h3 className="font-bold text-sm uppercase tracking-widest text-slate-400">Activity Log</h3>
            </div>
            <div className="p-4 relative">
              {dataLoading ? (
                <div className="text-center py-8 text-slate-400">
                  <span className="material-symbols-outlined animate-spin">progress_activity</span>
                </div>
              ) : activities.length === 0 ? (
                <div className="text-center py-8">
                  <span className="material-symbols-outlined text-4xl text-slate-600">history</span>
                  <p className="text-slate-400 mt-2 text-sm">No activity yet</p>
                  <p className="text-slate-500 text-xs">Your health events will appear here</p>
                </div>
              ) : (
                <>
                  <div className="absolute left-7 top-6 bottom-6 w-px bg-white/10"></div>
                  <div className="space-y-6">
                    {activities.map((activity) => (
                      <div key={activity.id} className="flex gap-4 relative">
                        <div className={`size-6 rounded-full flex items-center justify-center z-10 ${activity.event_type === "ALERT" ? "bg-red-500" :
                          activity.event_type === "MESSAGE" ? "bg-primary" :
                            "bg-teal-accent"
                          }`}>
                          <span className="material-symbols-outlined text-[14px] text-black">
                            {activity.event_type === "ALERT" ? "warning" :
                              activity.event_type === "MESSAGE" ? "chat" : "sensors"}
                          </span>
                        </div>
                        <div className="flex-1">
                          <p className="text-xs text-slate-400 font-medium">
                            {new Date(activity.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                          <p className="text-sm text-slate-200">{activity.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </main>

      <BottomNav />

      {/* Subtle Background HUD Texture */}
      <div className="fixed inset-0 pointer-events-none hud-scanline opacity-[0.03] z-0"></div>
    </div>
  );
}
