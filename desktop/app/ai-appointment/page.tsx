"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import MainHeader from "@/components/MainHeader";
import BottomNav from "@/components/BottomNav";
import SubHeader from "@/components/SubHeader";
import Link from "next/link";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

type SessionStatus = "idle" | "connecting" | "connected" | "speaking" | "listening" | "ended" | "error";

export default function AIAppointmentPage() {
    const { user, loading } = useAuth();
    const [enableVideo, setEnableVideo] = useState(false);
    const [showConsentModal, setShowConsentModal] = useState(false);
    const [sessionStatus, setSessionStatus] = useState<SessionStatus>("idle");
    const [statusMessage, setStatusMessage] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [sessionSummary, setSessionSummary] = useState<any>(null);

    // Refs for WebSocket and media
    const wsRef = useRef<WebSocket | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const audioWorkletRef = useRef<AudioWorkletNode | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const audioQueueRef = useRef<Float32Array[]>([]);
    const audioQueueRef2 = useRef<ArrayBuffer[]>([]);
    const isPlayingAudioRef = useRef(false);
    const activeAudioContextRef = useRef<AudioContext | null>(null);
    const activeSourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
    const isSessionActiveRef = useRef(false);
    const audioElementRef = useRef<HTMLAudioElement | null>(null);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            cleanup();
        };
    }, []);

    // Fetch summary fallback when session ends
    useEffect(() => {
        let pollInterval: NodeJS.Timeout;

        if (sessionStatus === "ended" && !sessionSummary && user?.id) {
            console.log("Session ended but no summary received, falling back to REST...");
            setStatusMessage("Finalizing your health report...");

            const fetchSummary = async () => {
                try {
                    const res = await fetch(`${WS_URL.replace('ws://', 'http://').replace('wss://', 'https://')}/api/patients/${user.id}/sessions/latest`);
                    if (res.ok) {
                        const data = await res.json();
                        // Verify this is a new session (within last 5 mins)
                        const sessionTime = new Date(data.started_at).getTime();
                        if (Date.now() - sessionTime < 300000) {
                            console.log("Latest session summary fetched via REST:", data.summary);
                            setSessionSummary({
                                summary: data.summary,
                                insights: data.ai_insights,
                                vitals: {
                                    heart_rate: data.heart_rate,
                                    spo2_level: data.spo2_level
                                },
                                medications: [] // Mock or fetch if needed
                            });
                            setStatusMessage("Report ready.");
                        }
                    }
                } catch (e) {
                    console.error("Error fetching latest session:", e);
                }
            };

            fetchSummary();
            // Poll for 45 seconds
            pollInterval = setInterval(fetchSummary, 3000);
            setTimeout(() => clearInterval(pollInterval), 45000);
        }

        return () => {
            if (pollInterval) clearInterval(pollInterval);
        };
    }, [sessionStatus, sessionSummary, user?.id]);

    const cleanup = useCallback(() => {
        isSessionActiveRef.current = false;

        // STOP PLAYBACK IMMEDIATELY
        if (activeSourceNodeRef.current) {
            try {
                activeSourceNodeRef.current.stop();
            } catch (e) {
                // Ignore
            }
            activeSourceNodeRef.current = null;
        }

        if (activeAudioContextRef.current) {
            try {
                activeAudioContextRef.current.close().catch(e => console.error("Error closing playback context:", e));
            } catch (e) {
                console.error("Error closing playback context:", e);
            }
            activeAudioContextRef.current = null;
        }

        // Clear audio queue
        audioQueueRef2.current = [];
        isPlayingAudioRef.current = false;

        // Stop capture context
        if (audioContextRef.current) {
            audioContextRef.current.close().catch(e => console.error("Error closing capture context:", e));
            audioContextRef.current = null;
        }

        // Stop media streams
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop());
            mediaStreamRef.current = null;
        }

        // Close WebSocket
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }
    }, []);

    const requestPermissions = () => {
        setShowConsentModal(true);
    };

    const handleConsentAccept = async () => {
        setShowConsentModal(false);
        await startLiveSession();
    };

    const handleConsentDecline = () => {
        setShowConsentModal(false);
    };

    const startLiveSession = async () => {
        if (!user) {
            setError("Please log in to use this feature.");
            return;
        }

        setSessionStatus("connecting");
        setError(null);
        setSessionStatus("connecting");
        setError(null);
        setStatusMessage("Connecting to Dr. Aegis...");
        isSessionActiveRef.current = true;

        try {
            // Request media permissions
            const constraints: MediaStreamConstraints = {
                audio: {
                    sampleRate: 16000,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                }
            };

            if (enableVideo) {
                constraints.video = {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    frameRate: { ideal: 1, max: 2 } // Low FPS for API
                };
            }

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            mediaStreamRef.current = stream;

            // Setup video preview if enabled
            if (enableVideo && videoRef.current) {
                videoRef.current.srcObject = stream;
            }

            // Create audio context
            audioContextRef.current = new AudioContext({ sampleRate: 16000 });

            // Connect to WebSocket with patient context
            console.log("Connecting WS with patient_id:", user.id);
            const ws = new WebSocket(`${WS_URL}/ws/live-session?patient_id=${user.id}`);
            wsRef.current = ws;

            ws.onopen = () => {
                console.log("WebSocket connected");
                // Send configuration
                ws.send(JSON.stringify({
                    type: "config",
                    enable_video: enableVideo
                }));
            };

            ws.onmessage = async (event) => {
                const message = JSON.parse(event.data);
                await handleServerMessage(message);
            };

            ws.onerror = (event) => {
                console.error("WebSocket error:", event);
                setError("Connection error");
                setSessionStatus("error");
            };

            ws.onclose = () => {
                console.log("WebSocket closed");
                if (sessionStatus !== "ended") {
                    setSessionStatus("ended");
                }
            };

        } catch (err: any) {
            console.error("Failed to start session:", err);
            setError(err.message || "Failed to access microphone");
            setSessionStatus("error");
        }
    };

    const handleServerMessage = async (message: any) => {
        switch (message.type) {
            case "status":
                if (message.status === "connected") {
                    setSessionStatus("connected");
                    setStatusMessage("Connected! Dr. Aegis is listening...");
                    // Start sending audio
                    startAudioCapture();
                    if (enableVideo) {
                        startVideoCapture();
                    }
                } else if (message.status === "ended") {
                    setSessionStatus("ended");
                    cleanup();
                }
                break;

            case "audio":
                // Receive audio from AI and play it
                setSessionStatus("speaking");
                await playAudio(message.data);
                break;

            case "text":
                // Display text (optional transcription)
                console.log("AI text:", message.content);
                break;

            case "summary":
                console.log("Session Summary Received:", message.data);
                setSessionSummary(message.data);
                break;

            case "error":
                setError(message.message);
                setSessionStatus("error");
                break;
        }
    };

    const startAudioCapture = () => {
        if (!audioContextRef.current || !mediaStreamRef.current || !wsRef.current) return;

        const audioContext = audioContextRef.current;
        const source = audioContext.createMediaStreamSource(mediaStreamRef.current);

        // Create a script processor for capturing audio
        // Using 2048 buffer size (approx 128ms at 16kHz) for better latency while maintaining stability
        const processor = audioContext.createScriptProcessor(2048, 1, 1);

        processor.onaudioprocess = (e) => {
            if (wsRef.current?.readyState !== WebSocket.OPEN) return;

            const inputData = e.inputBuffer.getChannelData(0);

            // Calculate RMS for Noise Gate
            let sumSquares = 0;
            for (let i = 0; i < inputData.length; i++) {
                sumSquares += inputData[i] * inputData[i];
            }
            const rms = Math.sqrt(sumSquares / inputData.length);

            // Noise Gate Threshold (adjust based on environment)
            const NOISE_THRESHOLD = 0.02;

            // Convert Float32 to Int16 PCM
            const pcmData = new Int16Array(inputData.length);

            if (rms < NOISE_THRESHOLD) {
                // Send strictly silence if below threshold
                pcmData.fill(0);
            } else {
                for (let i = 0; i < inputData.length; i++) {
                    const s = Math.max(-1, Math.min(1, inputData[i]));
                    pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }
            }

            // Convert to base64
            const base64 = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));

            // Send to server
            wsRef.current.send(JSON.stringify({
                type: "audio",
                data: base64,
                sample_rate: 16000
            }));
        };

        source.connect(processor);
        processor.connect(audioContext.destination);

        setSessionStatus("listening");
        setStatusMessage("Listening... Speak to Dr. Aegis");
    };

    const startVideoCapture = () => {
        if (!canvasRef.current || !videoRef.current || !wsRef.current) return;

        const canvas = canvasRef.current;
        const video = videoRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Capture frame every second
        const captureFrame = () => {
            if (wsRef.current?.readyState !== WebSocket.OPEN) return;

            canvas.width = 640;
            canvas.height = 480;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            // Convert to JPEG base64
            const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
            const base64 = dataUrl.split(',')[1];

            wsRef.current.send(JSON.stringify({
                type: "video",
                data: base64,
                mime_type: "image/jpeg"
            }));
        };

        // Capture every 1 second
        const intervalId = setInterval(captureFrame, 1000);

        // Store for cleanup
        (wsRef.current as any)._videoIntervalId = intervalId;
    };

    // Audio playback queue - using HTML5 Audio with WAV format

    // Helper to create WAV from PCM
    const createWavFromPcm = (pcmData: Int16Array, sampleRate: number): Blob => {
        const numChannels = 1;
        const bitsPerSample = 16;
        const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
        const blockAlign = numChannels * (bitsPerSample / 8);
        const dataSize = pcmData.length * (bitsPerSample / 8);
        const headerSize = 44;
        const totalSize = headerSize + dataSize;

        const buffer = new ArrayBuffer(totalSize);
        const view = new DataView(buffer);

        // WAV header
        const writeString = (offset: number, str: string) => {
            for (let i = 0; i < str.length; i++) {
                view.setUint8(offset + i, str.charCodeAt(i));
            }
        };

        writeString(0, 'RIFF');
        view.setUint32(4, totalSize - 8, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true); // fmt chunk size
        view.setUint16(20, 1, true); // audio format (PCM)
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitsPerSample, true);
        writeString(36, 'data');
        view.setUint32(40, dataSize, true);

        // Copy PCM data
        const pcmBytes = new Uint8Array(buffer, 44);
        const pcmView = new Uint8Array(pcmData.buffer);
        pcmBytes.set(pcmView);

        return new Blob([buffer], { type: 'audio/wav' });
    };

    const processAudioQueue = async () => {
        if (!isSessionActiveRef.current || isPlayingAudioRef.current || audioQueueRef2.current.length === 0) return;

        isPlayingAudioRef.current = true;

        // Combine all queued audio into one buffer
        const allChunks = audioQueueRef2.current.splice(0, audioQueueRef2.current.length);
        const totalLength = allChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
        const combined = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of allChunks) {
            combined.set(new Uint8Array(chunk), offset);
            offset += chunk.byteLength;
        }

        // Convert to Int16Array
        const int16Data = new Int16Array(combined.buffer);
        console.log(`Playing WAV audio: ${int16Data.length} samples (${(int16Data.length / 24000).toFixed(2)}s)`);

        try {
            let playbackContext = activeAudioContextRef.current;

            // Create new context if needed (Reuse existing context to prevent Bluetooth dropouts)
            if (!playbackContext || playbackContext.state === 'closed') {
                console.log("Creating new AudioContext for playback...");

                // Use system default sample rate for best compatibility
                playbackContext = new AudioContext();
                activeAudioContextRef.current = playbackContext;

                // Explicitly try to route to Bluetooth Hands-Free if available
                try {
                    const devices = await navigator.mediaDevices.enumerateDevices();
                    const audioOutputs = devices.filter(d => d.kind === 'audiooutput');

                    // Priority: Hands-Free -> Bluetooth -> Communications -> Default
                    let btDevice = audioOutputs.find(d =>
                        d.label.toLowerCase().includes('hands-free') ||
                        d.label.toLowerCase().includes('headset')
                    );

                    if (!btDevice) {
                        btDevice = audioOutputs.find(d => d.label.toLowerCase().includes('bluetooth'));
                    }
                    if (!btDevice) {
                        btDevice = audioOutputs.find(d => d.deviceId === 'communications');
                    }

                    if (btDevice && (playbackContext as any).setSinkId) {
                        console.log(`Routing audio to: ${btDevice.label}`);
                        await (playbackContext as any).setSinkId(btDevice.deviceId);
                    }
                } catch (e) {
                    console.warn("Audio routing failed:", e);
                }
            }

            // Ensure AudioContext is running
            if (playbackContext.state === 'suspended') {
                await playbackContext.resume();
            }

            // Double check session active after await
            if (!isSessionActiveRef.current) {
                // Don't close context here if we want to reuse, but stop playback flow
                isPlayingAudioRef.current = false;
                return;
            }

            // Convert Int16 PCM to Float32
            const float32Data = new Float32Array(int16Data.length);
            for (let i = 0; i < int16Data.length; i++) {
                float32Data[i] = int16Data[i] / 32768.0;
            }

            // Create audio buffer (Browser resamples 24k -> System Rate)
            const audioBuffer = playbackContext.createBuffer(1, float32Data.length, 24000);
            audioBuffer.getChannelData(0).set(float32Data);

            // Create and play source node
            const sourceNode = playbackContext.createBufferSource();
            sourceNode.buffer = audioBuffer;
            sourceNode.connect(playbackContext.destination);

            // Track active source
            activeSourceNodeRef.current = sourceNode;

            sourceNode.onended = () => {
                console.log("Audio segment ended");
                // DO NOT close playbackContext here - keep it alive for next chunk!

                if (activeSourceNodeRef.current === sourceNode) {
                    activeSourceNodeRef.current = null;
                }

                isPlayingAudioRef.current = false;

                // Only continue if session is still active
                if (isSessionActiveRef.current) {
                    // Check if more audio arrived while playing
                    if (audioQueueRef2.current.length > 0) {
                        processAudioQueue();
                    } else if (wsRef.current) {
                        setSessionStatus("listening");
                        setStatusMessage("Listening...");
                    }
                }
            };

            // Final check
            if (!isSessionActiveRef.current) {
                sourceNode.disconnect();
                return;
            }

            sourceNode.start();
            console.log("Audio playback started via Web Audio API");
        } catch (err) {
            console.error("Error playing audio:", err);
            isPlayingAudioRef.current = false;
        }
    };

    const playAudio = async (base64Audio: string) => {
        console.log("🔊 Received audio chunk, length:", base64Audio.length);

        try {
            // Decode base64 to ArrayBuffer
            const binaryString = atob(base64Audio);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            // Add to queue
            audioQueueRef2.current.push(bytes.buffer);

            // Start playback if not already playing (with small delay to batch chunks)
            if (!isPlayingAudioRef.current) {
                setTimeout(() => processAudioQueue(), 150);
            }
        } catch (err) {
            console.error("Error processing audio:", err);
        }
    };


    const endSession = () => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "end" }));
        }
        cleanup();
        setSessionStatus("ended");
        setStatusMessage("Session ended");
    };

    const getStatusColor = () => {
        switch (sessionStatus) {
            case "speaking": return "bg-primary";
            case "listening": return "bg-teal-accent";
            case "connected": return "bg-green-500";
            case "error": return "bg-red-500";
            default: return "bg-slate-500";
        }
    };

    const getStatusIcon = () => {
        switch (sessionStatus) {
            case "speaking": return "volume_up";
            case "listening": return "mic";
            case "connecting": return "sync";
            case "connected": return "check_circle";
            case "error": return "error";
            default: return "power_settings_new";
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-black text-white flex flex-col">
                <MainHeader />
                <div className="flex-1 flex items-center justify-center">
                    <span className="material-symbols-outlined text-4xl text-primary animate-pulse">smart_toy</span>
                </div>
                <BottomNav />
            </div>
        );
    }

    return (
        <div className="h-screen bg-black text-white flex flex-col">
            <MainHeader />
            <SubHeader
                title="AI Health Session"
                rightAction={
                    sessionStatus !== "idle" && sessionStatus !== "ended" ? (
                        <button onClick={endSession} className="text-red-400 text-sm font-medium">
                            End
                        </button>
                    ) : undefined
                }
            />

            {/* Hidden canvas for video frame capture */}
            <canvas ref={canvasRef} className="hidden" />

            {/* Consent Modal */}
            {showConsentModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-card-dark border border-white/10 rounded-2xl max-w-md w-full p-6">
                        <div className="text-center mb-6">
                            <div className="size-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-4">
                                <span className="material-symbols-outlined text-3xl text-primary">
                                    {enableVideo ? "videocam" : "mic"}
                                </span>
                            </div>
                            <h2 className="text-xl font-bold mb-2">Permission Required</h2>
                            <p className="text-slate-400 text-sm">
                                Allow access to your {enableVideo ? "camera and microphone" : "microphone"} for real-time conversation.
                            </p>
                        </div>

                        <div className="space-y-3 mb-6">
                            <div className="flex items-center gap-4 p-4 bg-white/5 rounded-xl border border-white/10">
                                <div className="size-10 bg-teal-accent/20 rounded-full flex items-center justify-center">
                                    <span className="material-symbols-outlined text-teal-accent text-xl">mic</span>
                                </div>
                                <div className="flex-1">
                                    <p className="font-medium text-sm">Microphone</p>
                                    <p className="text-xs text-slate-400">For real-time voice conversation</p>
                                </div>
                            </div>

                            {enableVideo && (
                                <div className="flex items-center gap-4 p-4 bg-white/5 rounded-xl border border-white/10">
                                    <div className="size-10 bg-primary/20 rounded-full flex items-center justify-center">
                                        <span className="material-symbols-outlined text-primary text-xl">videocam</span>
                                    </div>
                                    <div className="flex-1">
                                        <p className="font-medium text-sm">Camera</p>
                                        <p className="text-xs text-slate-400">For visual health assessment</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        <p className="text-xs text-slate-500 text-center mb-6">
                            🔒 Your session is private and not recorded.
                        </p>

                        <div className="flex gap-3">
                            <button
                                onClick={handleConsentDecline}
                                className="flex-1 h-11 bg-white/5 border border-white/10 rounded-xl font-medium hover:bg-white/10 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConsentAccept}
                                className="flex-1 h-11 bg-primary text-black rounded-xl font-bold hover:bg-primary/90 transition-colors"
                            >
                                Allow & Connect
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto px-4 py-6 pb-24">
                <div className="max-w-md w-full mx-auto text-center">
                    {sessionStatus === "idle" ? (
                        /* Pre-Session View */
                        <>
                            <div className="size-24 bg-gradient-to-br from-primary/30 to-teal-accent/20 rounded-full flex items-center justify-center mx-auto mb-6 relative">
                                <span className="material-symbols-outlined text-5xl text-primary">smart_toy</span>
                                <span className="absolute -bottom-1 -right-1 size-8 bg-teal-accent rounded-full flex items-center justify-center border-4 border-black">
                                    <span className="material-symbols-outlined text-lg text-black">health_and_safety</span>
                                </span>
                            </div>
                            <h2 className="text-2xl font-bold mb-2">Live AI Health Session</h2>
                            <p className="text-slate-400 mb-8 text-sm">
                                Real-time voice conversation with Dr. Aegis powered by Gemini Live API.
                            </p>

                            {/* Session Type Selection */}
                            <div className="bg-card-dark rounded-xl p-5 border border-white/10 mb-6">
                                <h3 className="font-bold mb-4 text-left text-sm">Choose Session Type</h3>

                                <div className="space-y-3">
                                    <button
                                        onClick={() => setEnableVideo(false)}
                                        className={`w-full flex items-center gap-3 p-4 rounded-xl border transition-all ${!enableVideo
                                            ? "bg-primary/10 border-primary"
                                            : "bg-white/5 border-white/10 hover:border-white/20"
                                            }`}
                                    >
                                        <div className={`size-12 rounded-full flex items-center justify-center ${!enableVideo ? "bg-primary/20" : "bg-white/10"
                                            }`}>
                                            <span className={`material-symbols-outlined text-2xl ${!enableVideo ? "text-primary" : "text-slate-400"}`}>mic</span>
                                        </div>
                                        <div className="text-left flex-1">
                                            <p className="font-medium">Voice Session</p>
                                            <p className="text-xs text-slate-400">Real-time voice conversation</p>
                                        </div>
                                        {!enableVideo && (
                                            <span className="material-symbols-outlined text-primary text-xl">check_circle</span>
                                        )}
                                    </button>

                                    <button
                                        onClick={() => setEnableVideo(true)}
                                        className={`w-full flex items-center gap-3 p-4 rounded-xl border transition-all ${enableVideo
                                            ? "bg-primary/10 border-primary"
                                            : "bg-white/5 border-white/10 hover:border-white/20"
                                            }`}
                                    >
                                        <div className={`size-12 rounded-full flex items-center justify-center ${enableVideo ? "bg-primary/20" : "bg-white/10"
                                            }`}>
                                            <span className={`material-symbols-outlined text-2xl ${enableVideo ? "text-primary" : "text-slate-400"}`}>videocam</span>
                                        </div>
                                        <div className="text-left flex-1">
                                            <p className="font-medium">Video Session</p>
                                            <p className="text-xs text-slate-400">Voice + visual assessment</p>
                                        </div>
                                        {enableVideo && (
                                            <span className="material-symbols-outlined text-primary text-xl">check_circle</span>
                                        )}
                                    </button>
                                </div>
                            </div>

                            <button
                                onClick={requestPermissions}
                                className="h-14 px-10 bg-gradient-to-r from-primary to-teal-accent text-black font-bold rounded-xl flex items-center gap-3 mx-auto hover:opacity-90 transition-all shadow-lg shadow-primary/20"
                            >
                                <span className="material-symbols-outlined">{enableVideo ? "videocam" : "mic"}</span>
                                Start Live Session
                            </button>
                        </>
                    ) : sessionStatus === "ended" ? (
                        /* Session Ended + Summary */
                        <div className="space-y-6 text-left animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="text-center">
                                <div className="size-16 bg-teal-accent/20 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <span className="material-symbols-outlined text-3xl text-teal-accent">check_circle</span>
                                </div>
                                <h2 className="text-2xl font-bold mb-1">Session Complete</h2>
                                <p className="text-slate-400 text-sm">Dr. Aegis has finalized your health report.</p>
                            </div>

                            {sessionSummary ? (
                                <div className="space-y-4">
                                    <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-3">
                                        <div className="flex items-center gap-2 text-primary">
                                            <span className="material-symbols-outlined text-sm">summarize</span>
                                            <h3 className="text-xs font-bold uppercase tracking-widest">Medical Summary</h3>
                                        </div>
                                        <p className="text-sm text-slate-200 leading-relaxed font-medium">
                                            {sessionSummary.summary}
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                                            <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Vitals Noted</p>
                                            <div className="space-y-1">
                                                {sessionSummary.vitals?.heart_rate && (
                                                    <div className="flex justify-between text-xs">
                                                        <span className="text-slate-400">Heart Rate</span>
                                                        <span className="text-primary font-bold">{sessionSummary.vitals.heart_rate} BPM</span>
                                                    </div>
                                                )}
                                                {sessionSummary.vitals?.spo2_level && (
                                                    <div className="flex justify-between text-xs">
                                                        <span className="text-slate-400">SpO2</span>
                                                        <span className="text-primary font-bold">{sessionSummary.vitals.spo2_level}%</span>
                                                    </div>
                                                )}
                                                {(!sessionSummary.vitals?.heart_rate && !sessionSummary.vitals?.spo2_level) && (
                                                    <span className="text-slate-500 italic text-[10px]">No vitals detected</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                                            <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Medications</p>
                                            <div className="space-y-1">
                                                {sessionSummary.medications?.length > 0 ? (
                                                    sessionSummary.medications.map((m: any, i: number) => (
                                                        <div key={i} className="flex justify-between text-xs">
                                                            <span className="text-slate-200 truncate pr-2">{m.name}</span>
                                                            <span className="text-teal-accent font-bold">{m.status}</span>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <span className="text-slate-500 italic text-[10px]">No meds discussed</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-primary/5 border border-primary/20 rounded-xl p-5">
                                        <div className="flex items-center gap-2 text-primary mb-2">
                                            <span className="material-symbols-outlined text-sm">lightbulb</span>
                                            <h3 className="text-xs font-bold uppercase tracking-widest">AI Insights</h3>
                                        </div>
                                        <div className="text-xs text-slate-300 leading-relaxed space-y-2">
                                            {sessionSummary.insights}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="py-12 flex flex-col items-center justify-center text-slate-500">
                                    <span className="material-symbols-outlined animate-spin mb-2">progress_activity</span>
                                    <p className="text-xs uppercase font-bold tracking-tighter">Analyzing Session...</p>
                                </div>
                            )}

                            <div className="flex gap-4 pt-4">
                                <Link href="/" className="flex-1 h-12 bg-white/5 border border-white/10 rounded-lg flex items-center justify-center font-bold text-sm tracking-tight hover:bg-white/10 transition-colors">
                                    Return to Dashboard
                                </Link>
                                <button
                                    onClick={() => {
                                        setSessionSummary(null);
                                        setSessionStatus("idle");
                                    }}
                                    className="flex-1 h-12 bg-primary text-black rounded-lg font-bold text-sm tracking-tight hover:bg-primary/90 transition-colors"
                                >
                                    Start New Session
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* Active Session */
                        <>
                            {/* Video preview if enabled */}
                            {enableVideo && (
                                <div className="relative rounded-xl overflow-hidden mb-6 bg-card-dark border border-white/10">
                                    <video
                                        ref={videoRef}
                                        autoPlay
                                        muted
                                        playsInline
                                        className="w-full h-48 object-cover bg-black"
                                    />
                                    <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm rounded-full px-2 py-1 flex items-center gap-1.5">
                                        <span className="size-2 bg-red-500 rounded-full animate-pulse" />
                                        <span className="text-xs">Live</span>
                                    </div>
                                </div>
                            )}

                            {/* Status indicator */}
                            <div className={`size-32 rounded-full flex items-center justify-center mx-auto mb-6 transition-all ${getStatusColor()}/20`}>
                                <div className={`size-24 rounded-full flex items-center justify-center ${getStatusColor()}/30 ${sessionStatus === "speaking" || sessionStatus === "listening" ? "animate-pulse" : ""}`}>
                                    <span className={`material-symbols-outlined text-5xl ${getStatusColor().replace('bg-', 'text-')}`}>
                                        {getStatusIcon()}
                                    </span>
                                </div>
                            </div>

                            <h2 className="text-xl font-bold mb-2">
                                {sessionStatus === "connecting" && (
                                    <span className="flex items-center gap-2 justify-center">
                                        <span className="size-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                                        <span className="size-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                                        <span className="size-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                                        Connecting...
                                    </span>
                                )}
                                {sessionStatus === "connected" && <span className="text-green-400 animate-pulse">Start Speaking Now</span>}
                                {sessionStatus === "listening" && "Listening..."}
                                {sessionStatus === "speaking" && "Dr. Aegis Speaking"}
                                {sessionStatus === "error" && "Connection Error"}
                            </h2>

                            <p className="text-slate-400 mb-8 font-medium">{statusMessage}</p>

                            {error && (
                                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6">
                                    <p className="text-red-400 text-sm">{error}</p>
                                </div>
                            )}

                            {sessionStatus !== "error" && (
                                <div className="bg-card-dark rounded-xl p-4 border border-white/10">
                                    <p className="text-xs text-slate-400 mb-2">Session Tips:</p>
                                    <ul className="text-xs text-slate-300 space-y-1 text-left">
                                        <li>• Speak clearly and naturally</li>
                                        <li>• Wait for Dr. Aegis to finish speaking</li>
                                        <li>• Describe symptoms in detail</li>
                                    </ul>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </main>

            <BottomNav />
        </div>
    );
}
