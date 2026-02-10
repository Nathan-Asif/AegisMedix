"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth, getAuthHeader } from "@/lib/auth-context";
import MainHeader from "@/components/MainHeader";
import BottomNav from "@/components/BottomNav";
import SubHeader from "@/components/SubHeader";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Message {
    id: string;
    role: "user" | "assistant";
    content: string;
    created_at: string;
}

interface ChatSession {
    id: string;
    is_active: boolean;
    started_at: string;
}

export default function ChatPage() {
    const { user, loading: authLoading } = useAuth();
    const [session, setSession] = useState<ChatSession | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState("");
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const recognitionRef = useRef<any>(null);

    useEffect(() => {
        if (user?.id) {
            loadChatSession();
        }
    }, [user?.id]);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Initialize speech recognition
    useEffect(() => {
        if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
            const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = false;
            recognitionRef.current.interimResults = true;
            recognitionRef.current.lang = 'en-US';

            recognitionRef.current.onresult = (event: any) => {
                const current = event.resultIndex;
                const result = event.results[current];
                if (result.isFinal) {
                    const text = result[0].transcript;
                    setTranscript("");
                    setInput(prev => prev + (prev ? ' ' : '') + text);
                } else {
                    setTranscript(result[0].transcript);
                }
            };

            recognitionRef.current.onend = () => {
                setIsListening(false);
            };

            recognitionRef.current.onerror = (event: any) => {
                console.error("Speech recognition error:", event.error);
                setIsListening(false);
            };
        }

        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.abort();
            }
        };
    }, []);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    const toggleListening = () => {
        if (!recognitionRef.current) {
            alert("Speech recognition not supported in this browser");
            return;
        }

        if (isListening) {
            recognitionRef.current.stop();
            setIsListening(false);
        } else {
            setIsListening(true);
            recognitionRef.current.start();
        }
    };

    const loadChatSession = async () => {
        try {
            const response = await fetch(`${API_URL}/api/chat/session`, {
                headers: { ...getAuthHeader() },
            });
            if (response.ok) {
                const data = await response.json();
                setSession(data.session);
                setMessages(data.messages || []);
            }
        } catch (error) {
            console.error("Failed to load chat session:", error);
        } finally {
            setLoading(false);
        }
    };

    const startNewSession = async () => {
        try {
            const response = await fetch(`${API_URL}/api/chat/session/new`, {
                method: "POST",
                headers: { ...getAuthHeader() },
            });
            if (response.ok) {
                const data = await response.json();
                setSession(data.session);
                setMessages([]);
            }
        } catch (error) {
            console.error("Failed to start new session:", error);
        }
    };

    const sendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || sending) return;

        const userMessage = input.trim();
        setInput("");
        setSending(true);

        // Optimistically add user message
        const tempUserMsg: Message = {
            id: `temp-${Date.now()}`,
            role: "user",
            content: userMessage,
            created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, tempUserMsg]);

        try {
            const response = await fetch(`${API_URL}/api/chat/message`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...getAuthHeader(),
                },
                body: JSON.stringify({ content: userMessage }),
            });

            if (response.ok) {
                const data = await response.json();

                // Replace temp message with real ones
                setMessages((prev) => {
                    const filtered = prev.filter((m) => m.id !== tempUserMsg.id);
                    return [
                        ...filtered,
                        data.user_message,
                        data.ai_message,
                    ];
                });
            } else {
                // Remove temp message on error
                setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
            }
        } catch (error) {
            console.error("Failed to send message:", error);
            setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
        } finally {
            setSending(false);
        }
    };

    const formatTime = (dateStr: string) => {
        if (!dateStr) return "";
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return "";
        return date.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    if (authLoading || loading) {
        return (
            <div className="min-h-screen bg-black text-white flex flex-col">
                <MainHeader />
                <div className="flex-1 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-4">
                        <span className="material-symbols-outlined text-4xl text-primary animate-pulse">smart_toy</span>
                        <p className="text-slate-400">Connecting to Dr. Aegis...</p>
                    </div>
                </div>
                <BottomNav />
            </div>
        );
    }

    return (
        <div className="h-screen bg-black text-white flex flex-col">
            <MainHeader />
            <SubHeader
                title="Dr. Aegis"
                rightAction={
                    <button
                        onClick={startNewSession}
                        className="text-primary hover:text-primary/80 transition-colors text-sm font-medium"
                    >
                        New Chat
                    </button>
                }
            />

            {/* Messages - scrollable area */}
            <main className="flex-1 overflow-y-auto px-4 py-4 pb-40">
                <div className="max-w-4xl mx-auto">
                    {messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center py-10">
                            <div className="size-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                                <span className="material-symbols-outlined text-4xl text-primary">smart_toy</span>
                            </div>
                            <h2 className="text-xl font-bold text-white mb-2">Hello, I&apos;m Dr. Aegis</h2>
                            <p className="text-slate-400 max-w-md">
                                Your AI Medical Sentinel. I&apos;m here to help with medication guidance,
                                recovery monitoring, and health questions. How can I assist you today?
                            </p>
                            <div className="mt-6 grid grid-cols-2 gap-3 w-full max-w-sm">
                                <button
                                    onClick={() => setInput("How should I take my medications today?")}
                                    className="p-3 bg-white/5 border border-white/10 rounded-lg text-sm text-left hover:bg-white/10 transition-colors"
                                >
                                    💊 Medication guidance
                                </button>
                                <button
                                    onClick={() => setInput("I'm feeling some discomfort, can you help?")}
                                    className="p-3 bg-white/5 border border-white/10 rounded-lg text-sm text-left hover:bg-white/10 transition-colors"
                                >
                                    🩺 Symptom check
                                </button>
                                <button
                                    onClick={() => setInput("What should I know about my recovery?")}
                                    className="p-3 bg-white/5 border border-white/10 rounded-lg text-sm text-left hover:bg-white/10 transition-colors"
                                >
                                    📋 Recovery tips
                                </button>
                                <button
                                    onClick={() => setInput("I have a question about my health.")}
                                    className="p-3 bg-white/5 border border-white/10 rounded-lg text-sm text-left hover:bg-white/10 transition-colors"
                                >
                                    ❓ General question
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {messages.map((message) => (
                                <div
                                    key={message.id}
                                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                                >
                                    <div
                                        className={`max-w-[80%] rounded-2xl px-4 py-3 ${message.role === "user"
                                            ? "bg-primary text-black rounded-br-sm"
                                            : "bg-card-dark border border-white/10 rounded-bl-sm"
                                            }`}
                                    >
                                        {message.role === "assistant" && (
                                            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-white/10">
                                                <span className="material-symbols-outlined text-sm text-primary">smart_toy</span>
                                                <span className="text-xs text-primary font-bold">Dr. Aegis</span>
                                            </div>
                                        )}
                                        <p className={`text-sm whitespace-pre-wrap ${message.role === "user" ? "text-black" : "text-white"}`}>
                                            {message.content}
                                        </p>
                                        {formatTime(message.created_at) && (
                                            <p className={`text-[10px] mt-1 ${message.role === "user" ? "text-black/60" : "text-slate-500"}`}>
                                                {formatTime(message.created_at)}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            ))}

                            {/* Typing indicator */}
                            {sending && (
                                <div className="flex justify-start">
                                    <div className="bg-card-dark border border-white/10 rounded-2xl rounded-bl-sm px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <span className="material-symbols-outlined text-sm text-primary animate-pulse">smart_toy</span>
                                            <span className="text-xs text-slate-400">Dr. Aegis is typing</span>
                                            <span className="flex gap-1">
                                                <span className="size-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                                                <span className="size-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                                                <span className="size-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div ref={messagesEndRef} />
                        </div>
                    )}
                </div>
            </main>

            {/* Input Area - Fixed with proper spacing */}
            <div className="fixed bottom-16 left-0 right-0 bg-black border-t border-white/10 px-4 py-3">
                {/* Live transcript */}
                {transcript && (
                    <div className="max-w-4xl mx-auto mb-2">
                        <p className="text-xs text-primary italic">🎤 {transcript}...</p>
                    </div>
                )}

                <form onSubmit={sendMessage} className="max-w-4xl mx-auto flex gap-2">
                    {/* Mic Button */}
                    <button
                        type="button"
                        onClick={toggleListening}
                        className={`size-11 flex-shrink-0 rounded-full flex items-center justify-center transition-all ${isListening
                                ? "bg-red-500 text-white animate-pulse"
                                : "bg-teal-accent/20 text-teal-accent hover:bg-teal-accent hover:text-black"
                            }`}
                    >
                        <span className="material-symbols-outlined text-xl">{isListening ? "mic" : "mic_none"}</span>
                    </button>

                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={isListening ? "Listening..." : "Message Dr. Aegis..."}
                        disabled={sending}
                        className="flex-1 h-11 px-4 bg-card-dark border border-white/10 rounded-full text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-primary/50 disabled:opacity-50"
                    />
                    <button
                        type="submit"
                        disabled={!input.trim() || sending}
                        className="size-11 flex-shrink-0 rounded-full bg-primary text-black flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
                    >
                        <span className="material-symbols-outlined text-xl">send</span>
                    </button>
                </form>
                <p className="text-center text-slate-600 text-[10px] mt-2">
                    Dr. Aegis provides guidance only. For emergencies, call 911.
                </p>
            </div>

            <BottomNav />
        </div>
    );
}
