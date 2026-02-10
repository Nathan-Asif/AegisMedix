"use client";

import { useState, useEffect, useRef } from "react";
import { getAuthHeader } from "@/lib/auth-context";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Notification {
    id: string;
    title: string;
    message: string | null;
    type: string;
    is_read: boolean;
    created_at: string;
}

interface NotificationDropdownProps {
    patientId: string;
}

export default function NotificationDropdown({ patientId }: NotificationDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Fetch unread count on mount
    useEffect(() => {
        fetchUnreadCount();
        // Poll every 30 seconds
        const interval = setInterval(fetchUnreadCount, 30000);
        return () => clearInterval(interval);
    }, [patientId]);

    const fetchUnreadCount = async () => {
        try {
            const response = await fetch(
                `${API_URL}/api/patients/${patientId}/notifications/unread-count`,
                { headers: { ...getAuthHeader() } }
            );
            if (response.ok) {
                const data = await response.json();
                setUnreadCount(data.count);
            }
        } catch (error) {
            console.error("Failed to fetch unread count:", error);
        }
    };

    const fetchNotifications = async () => {
        setLoading(true);
        try {
            const response = await fetch(
                `${API_URL}/api/patients/${patientId}/notifications`,
                { headers: { ...getAuthHeader() } }
            );
            if (response.ok) {
                const data = await response.json();
                setNotifications(data);
            }
        } catch (error) {
            console.error("Failed to fetch notifications:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleOpen = () => {
        setIsOpen(!isOpen);
        if (!isOpen) {
            fetchNotifications();
        }
    };

    const markAsRead = async (notificationId: string) => {
        try {
            await fetch(`${API_URL}/api/notifications/${notificationId}/read`, {
                method: "PUT",
                headers: { ...getAuthHeader() },
            });
            setNotifications(notifications.map(n =>
                n.id === notificationId ? { ...n, is_read: true } : n
            ));
            setUnreadCount(Math.max(0, unreadCount - 1));
        } catch (error) {
            console.error("Failed to mark as read:", error);
        }
    };

    const deleteNotification = async (notificationId: string) => {
        try {
            await fetch(`${API_URL}/api/notifications/${notificationId}`, {
                method: "DELETE",
                headers: { ...getAuthHeader() },
            });
            const deleted = notifications.find(n => n.id === notificationId);
            setNotifications(notifications.filter(n => n.id !== notificationId));
            if (deleted && !deleted.is_read) {
                setUnreadCount(Math.max(0, unreadCount - 1));
            }
        } catch (error) {
            console.error("Failed to delete notification:", error);
        }
    };

    const markAllRead = async () => {
        try {
            await fetch(`${API_URL}/api/patients/${patientId}/notifications/read-all`, {
                method: "PUT",
                headers: { ...getAuthHeader() },
            });
            setNotifications(notifications.map(n => ({ ...n, is_read: true })));
            setUnreadCount(0);
        } catch (error) {
            console.error("Failed to mark all as read:", error);
        }
    };

    const formatTime = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins < 1) return "Just now";
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
        return date.toLocaleDateString();
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case "ALERT": return "warning";
            case "REMINDER": return "schedule";
            default: return "info";
        }
    };

    const getTypeColor = (type: string) => {
        switch (type) {
            case "ALERT": return "text-red-400";
            case "REMINDER": return "text-primary";
            default: return "text-teal-accent";
        }
    };

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Bell Button */}
            <button
                onClick={handleOpen}
                className="relative flex size-10 items-center justify-center rounded-lg bg-transparent text-slate-400 hover:text-white transition-colors"
            >
                <span className="material-symbols-outlined">notifications</span>
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 size-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                        {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                )}
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div className="absolute right-0 top-12 w-80 bg-card-dark border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-white/10">
                        <h3 className="text-white font-bold">Notifications</h3>
                        {unreadCount > 0 && (
                            <button
                                onClick={markAllRead}
                                className="text-primary text-xs font-medium hover:underline"
                            >
                                Mark all read
                            </button>
                        )}
                    </div>

                    {/* Notifications List */}
                    <div className="max-h-80 overflow-y-auto">
                        {loading ? (
                            <div className="p-4 text-center text-slate-400">
                                <span className="material-symbols-outlined animate-spin">progress_activity</span>
                            </div>
                        ) : notifications.length === 0 ? (
                            <div className="p-8 text-center">
                                <span className="material-symbols-outlined text-4xl text-slate-600">notifications_off</span>
                                <p className="text-slate-400 text-sm mt-2">No notifications yet</p>
                            </div>
                        ) : (
                            notifications.map((notification) => (
                                <div
                                    key={notification.id}
                                    className={`p-4 border-b border-white/5 hover:bg-white/5 transition-colors ${!notification.is_read ? "bg-primary/5" : ""
                                        }`}
                                >
                                    <div className="flex items-start gap-3">
                                        <span className={`material-symbols-outlined text-lg ${getTypeColor(notification.type)}`}>
                                            {getTypeIcon(notification.type)}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-2">
                                                <p className={`text-sm font-medium truncate ${!notification.is_read ? "text-white" : "text-slate-300"}`}>
                                                    {notification.title}
                                                </p>
                                                <span className="text-slate-500 text-[10px] whitespace-nowrap">
                                                    {formatTime(notification.created_at)}
                                                </span>
                                            </div>
                                            {notification.message && (
                                                <p className="text-slate-400 text-xs mt-1 line-clamp-2">{notification.message}</p>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => deleteNotification(notification.id)}
                                            className="text-slate-500 hover:text-red-400 transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-sm">close</span>
                                        </button>
                                    </div>
                                    {!notification.is_read && (
                                        <button
                                            onClick={() => markAsRead(notification.id)}
                                            className="text-primary text-xs mt-2 hover:underline"
                                        >
                                            Mark as read
                                        </button>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
