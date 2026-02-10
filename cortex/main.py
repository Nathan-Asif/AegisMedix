from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import List, Literal, Optional, Annotated
from datetime import datetime
import asyncio
import random
import json
from database import get_patient_context_string

app = FastAPI(title="AegisMedix Cortex", version="0.4.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBearer(auto_error=False)

async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)]
) -> dict | None:
    """Dependency to get current authenticated user"""
    if not credentials:
        return None
    try:
        from auth import verify_token
        user = await verify_token(credentials.credentials)
        return user
    except Exception:
        return None

async def require_auth(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)]
) -> dict:
    """Dependency that requires authentication"""
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        from auth import verify_token
        user = await verify_token(credentials.credentials)
        if not user:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        return user
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Authentication failed")

# --- DATA MODELS ---
class RiskFeedItem(BaseModel):
    id: str
    timestamp: str
    event_type: str
    title: str
    description: str
    status: Literal["CONFIRMED", "STABLE", "LOGGED", "ALERT", "WARNING"]

class VitalsData(BaseModel):
    heart_rate: int
    heart_rate_status: str = "STABLE"
    spo2_level: int
    spo2_status: str = "OPTIMAL"
    sleep_hours: float
    sleep_status: str = "GOOD"

class VitalsInput(BaseModel):
    patient_id: str
    heart_rate: int
    spo2_level: int
    sleep_hours: float

class CustomMedicationInput(BaseModel):
    name: str
    dosage: str = None

class MedicationLogInput(BaseModel):
    medication_id: str
    patient_id: str

class ActivityLogInput(BaseModel):
    patient_id: str
    event_type: str
    title: str
    description: str
    severity: str = "INFO"

# --- CORE LOGIC & BACKGROUND TASKS ---

async def medication_reminder_task():
    """Background task to send medication reminders"""
    from database import get_pending_reminders
    from notifications import send_email_reminder
    
    print("🚀 Medication Reminder background task started")
    while True:
        try:
            # get_pending_reminders is now synchronous, so we run it in a thread
            pending = await asyncio.to_thread(get_pending_reminders)
            
            for item in pending:
                subject = f"🕒 Medication Reminder: {item['med_name']}"
                body = (
                    f"Hi {item['patient_name']},\n\n"
                    f"This is a reminder from AegisMedix to take your medication: {item['med_name']} ({item['dosage']}).\n"
                    f"Scheduled for: {item['scheduled_time']}\n\n"
                    f"Please log it as 'Taken' in your dashboard once you've taken it.\n\n"
                    f"Take care,\nDr. Aegis"
                )
                # send_email_reminder is async and already uses run_in_executor internally
                await send_email_reminder(item['patient_email'], subject, body)
                
            await asyncio.sleep(60) # Run every minute
        except Exception as e:
            print(f"❌ Error in reminder task: {e}")
            await asyncio.sleep(60)

@app.on_event("startup")
async def startup_event():
    # Use a safer way to launch the background task
    loop = asyncio.get_event_loop()
    loop.create_task(medication_reminder_task())

# --- MOCK DATA ---
MOCK_EVENTS = [
    {"event_type": "pill_verification", "title": "Pill Verification", "description": "Metoprolol 50mg - Dosage Correct", "status": "CONFIRMED"},
    {"event_type": "posture_analysis", "title": "Posture Analysis", "description": "Sitting upright, no sway detected.", "status": "STABLE"},
    {"event_type": "sleep_quality", "title": "Sleep Quality", "description": "6.5h Recorded. REM cycles normal.", "status": "LOGGED"},
    {"event_type": "nocturnal_movement", "title": "Nocturnal Movement", "description": "Minor restlessness detected.", "status": "ALERT"},
    {"event_type": "fall_risk", "title": "Fall Risk Assessment", "description": "Gait analysis: Steady.", "status": "STABLE"},
]

def generate_risk_event() -> RiskFeedItem:
    event = random.choice(MOCK_EVENTS)
    return RiskFeedItem(
        id=f"evt_{random.randint(1000, 9999)}",
        timestamp=datetime.now().strftime("%H:%M"),
        **event
    )

def generate_mock_vitals() -> dict:
    return {
        "heart_rate": random.randint(68, 82),
        "heart_rate_status": "STABLE",
        "spo2_level": random.randint(96, 99),
        "spo2_status": "OPTIMAL",
        "sleep_hours": round(random.uniform(6.5, 8.5), 1),
        "sleep_status": "GOOD"
    }

# --- AUTHENTICATION API ---
@app.post("/api/auth/register")
async def register(request: dict):
    """Register a new patient/user"""
    from auth import RegisterRequest, register_user
    try:
        reg_request = RegisterRequest(**request)
        result = await register_user(reg_request)
        if not result.success:
            raise HTTPException(status_code=400, detail=result.message)
        return result
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

@app.post("/api/auth/login")
async def login(request: dict):
    """Login and get access token"""
    from auth import LoginRequest, login_user
    try:
        login_request = LoginRequest(**request)
        result = await login_user(login_request)
        if not result.success:
            raise HTTPException(status_code=401, detail=result.message)
        return result
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

@app.get("/api/auth/me")
async def get_me(user: dict = Depends(require_auth)):
    """Get current authenticated user"""
    return {"success": True, "user": user}

@app.post("/api/auth/verify")
async def verify_token_endpoint(request: dict):
    """Verify if token is valid"""
    from auth import verify_token
    token = request.get("access_token")
    if not token:
        raise HTTPException(status_code=400, detail="access_token required")
    user = await verify_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return {"success": True, "valid": True, "user": user}

@app.post("/api/auth/logout")
async def logout(user: dict = Depends(require_auth)):
    """Logout current user"""
    from auth import logout_user
    # Token is invalidated client-side, but we can do server cleanup here
    return {"success": True, "message": "Logged out successfully"}

@app.post("/api/auth/refresh")
async def refresh_token(request: dict):
    """Refresh access token"""
    from auth import refresh_session
    refresh_token = request.get("refresh_token")
    if not refresh_token:
        raise HTTPException(status_code=400, detail="refresh_token required")
    result = await refresh_session(refresh_token)
    if not result.success:
        raise HTTPException(status_code=401, detail=result.message)
    return result

# --- PATIENT & HEALTH API ---
@app.get("/")
async def root():
    return {"status": "online", "system": "AegisMedix Cortex", "version": "0.4.0"}


@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

# --- Patient Endpoints ---
@app.get("/api/patients/{patient_id}")
async def get_patient(patient_id: str):
    """Get patient profile by ID"""
    try:
        from database import get_patient as db_get_patient
        patient = await db_get_patient(patient_id)
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")
        return patient
    except ImportError:
        # Fallback mock data if DB not configured
        return {
            "id": patient_id,
            "full_name": "Sarah Johnson",
            "email": "sarah.johnson@example.com",
            "recovery_protocol": "#8829-X",
            "recovery_start_date": "2026-01-18",
            "recovery_duration_days": 30,
            "is_vip": True
        }

@app.get("/api/patients/{patient_id}/sessions/latest")
async def get_latest_patient_session(patient_id: str):
    """Get the most recent session summary for a patient"""
    try:
        from database import get_latest_session
        session = await get_latest_session(patient_id)
        if not session:
            raise HTTPException(status_code=404, detail="No sessions found for this patient")
        return session
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class ProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    emergency_contact: Optional[str] = None
    emergency_number: Optional[str] = None
    blood_type: Optional[str] = None
    allergies: Optional[str] = None
    diagnosis: Optional[str] = None
    recovery_protocol: Optional[str] = None
    recovery_start_date: Optional[str] = None
    recovery_duration_days: Optional[int] = None


@app.put("/api/patients/{patient_id}/recovery/reset")
async def reset_patient_recovery(patient_id: str, user: dict = Depends(require_auth)):
    """Reset recovery progress start date"""
    if user["id"] != patient_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        from database import reset_recovery
        await reset_recovery(patient_id)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/patients/{patient_id}/recovery/clear")
async def clear_patient_recovery(patient_id: str, user: dict = Depends(require_auth)):
    """Clear recovery diagnosis and protocol"""
    if user["id"] != patient_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        from database import clear_recovery
        await clear_recovery(patient_id)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/patients/{patient_id}")
async def update_patient_profile(patient_id: str, profile: ProfileUpdate, user: dict = Depends(require_auth)):
    """Update patient profile"""
    # Verify user is updating their own profile
    if user["id"] != patient_id:
        raise HTTPException(status_code=403, detail="Cannot update another user's profile")
    
    try:
        from database import update_patient
        update_data = {k: v for k, v in profile.model_dump().items() if v is not None}
        if not update_data:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        result = await update_patient(patient_id, update_data)
        if not result:
            raise HTTPException(status_code=404, detail="Patient not found")
        return {"success": True, "data": result}
    except ImportError:
        return {"success": True, "message": "Mock: Profile updated"}


from fastapi import UploadFile, File
import base64
import uuid


@app.post("/api/patients/{patient_id}/avatar")
async def upload_avatar(patient_id: str, file: UploadFile = File(...), user: dict = Depends(require_auth)):
    """Upload patient avatar"""
    # Verify user is updating their own avatar
    if user["id"] != patient_id:
        raise HTTPException(status_code=403, detail="Cannot update another user's avatar")
    
    # Validate file type
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    try:
        from database import get_supabase_client, update_avatar_url
        client = get_supabase_client()
        
        # Read file content
        content = await file.read()
        
        # Generate unique filename
        ext = file.filename.split(".")[-1] if file.filename else "png"
        filename = f"avatars/{patient_id}/{uuid.uuid4()}.{ext}"
        
        # Upload to Supabase Storage
        client.storage.from_("avatars").upload(filename, content, {"content-type": file.content_type})
        
        # Get public URL
        avatar_url = client.storage.from_("avatars").get_public_url(filename)
        
        # Update patient record
        await update_avatar_url(patient_id, avatar_url)
        
        return {"success": True, "avatar_url": avatar_url}
    except Exception as e:
        # Fallback - store as base64 data URL (not recommended for production)
        content = await file.read()
        data_url = f"data:{file.content_type};base64,{base64.b64encode(content).decode()}"
        try:
            from database import update_avatar_url
            await update_avatar_url(patient_id, data_url)
            return {"success": True, "avatar_url": data_url}
        except:
            raise HTTPException(status_code=500, detail=f"Failed to upload avatar: {str(e)}")

# --- STREAMING & DATA FEED ---

@app.get("/api/patients/{patient_id}/vitals")
async def get_patient_vitals(patient_id: str):
    """Get latest vitals for a patient"""
    try:
        from database import get_latest_vitals
        vitals = await get_latest_vitals(patient_id)
        return vitals or generate_mock_vitals()
    except ImportError:
        return generate_mock_vitals()

@app.post("/api/vitals")
async def record_vitals(vitals: VitalsInput):
    """Record new vitals reading"""
    try:
        from database import insert_vitals
        result = await insert_vitals(
            vitals.patient_id,
            vitals.heart_rate,
            vitals.spo2_level,
            vitals.sleep_hours
        )
        return {"success": True, "data": result}
    except ImportError:
        return {"success": True, "message": "Mock: Vitals recorded"}

# --- Medications Endpoints ---
@app.get("/api/patients/{patient_id}/medications")
async def get_medications(patient_id: str):
    """Get all medications for a patient"""
    try:
        from database import get_patient_medications
        return await get_patient_medications(patient_id)
    except ImportError:
        return [
            {"id": "1", "name": "Beta Blocker", "dosage": "20mg", "scheduled_time": "12:00", "category": "Blood Pressure"},
            {"id": "2", "name": "Lisinopril", "dosage": "10mg", "scheduled_time": "20:00", "category": "Blood Pressure"},
        ]

@app.get("/api/patients/{patient_id}/medications/schedule")
@app.get("/api/patients/{patient_id}/medications/today")
async def get_todays_schedule(patient_id: str):
    """Get today's medication schedule with status"""
    try:
        from database import get_todays_medication_schedule
        return await get_todays_medication_schedule(patient_id)
    except ImportError:
        return [
            {"medication": {"name": "Morning Vitals Check"}, "status": "TAKEN", "scheduled_for": "08:00"},
            {"medication": {"name": "Beta Blocker (20mg)"}, "status": "UPCOMING", "scheduled_for": "12:00"},
        ]

@app.delete("/api/patients/{patient_id}/medications/{medication_id}")
async def delete_med_endpoint(patient_id: str, medication_id: str):
    """Delete a medication"""
    try:
        from database import delete_medication
        result = await delete_medication(medication_id, patient_id)
        return {"success": result}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.post("/api/medications/log")
async def log_medication(log: MedicationLogInput):
    """Log that a medication was taken"""
    try:
        from database import log_medication_taken
        result = await log_medication_taken(log.medication_id, log.patient_id)
        return {"success": True, "data": result}
    except ImportError:
        return {"success": True, "message": "Mock: Medication logged"}

@app.delete("/api/medications/log/{log_id}")
async def delete_med_log_endpoint(log_id: str):
    """Delete a medication log entry (untake)"""
    try:
        from database import delete_medication_log
        result = await delete_medication_log(log_id)
        return {"success": result}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.post("/api/patients/{patient_id}/medications/log-custom")
async def log_custom_medication(patient_id: str, payload: CustomMedicationInput):
    """Log a custom medication not in the schedule"""
    try:
        from database import add_and_log_medication
        # Use the existing function to create med, add to schedule, and log activity
        result = await add_and_log_medication(
            patient_id, 
            payload.name, 
            "Self-Reported", 
            payload.dosage or "As needed"
        )
        return {"success": True, "data": result}
    except Exception as e:
        print(f"Error logging custom med: {e}")
        return {"success": False, "error": str(e)}

# --- Activity Log Endpoints ---
@app.get("/api/patients/{patient_id}/activity")
async def get_activity(patient_id: str, limit: int = 10):
    """Get recent activity log"""
    try:
        from database import get_activity_logs
        return await get_activity_logs(patient_id, limit)
    except ImportError:
        return [
            {"event_type": "SENSOR", "title": "Sensor calibration", "description": "All nodes optimal", "created_at": "10:45 AM"},
            {"event_type": "MESSAGE", "title": "Dr. Aris", "description": "Message regarding hydration levels", "created_at": "09:12 AM"},
        ]

@app.post("/api/activity")
async def create_activity(log: ActivityLogInput):
    """Create new activity log entry"""
    try:
        from database import create_activity_log
        result = await create_activity_log(
            log.patient_id,
            log.event_type,
            log.title,
            log.description,
            log.severity
        )
        return {"success": True, "data": result}
    except ImportError:
        return {"success": True, "message": "Mock: Activity logged"}

# --- Notification Endpoints ---
@app.get("/api/patients/{patient_id}/notifications")
async def get_notifications(patient_id: str, limit: int = 20):
    """Get notifications for a patient"""
    try:
        from notifications import get_patient_notifications
        return await get_patient_notifications(patient_id, limit)
    except ImportError:
        return []

@app.get("/api/patients/{patient_id}/notifications/unread-count")
async def get_unread_notification_count(patient_id: str):
    """Get count of unread notifications"""
    try:
        from notifications import get_unread_count
        count = await get_unread_count(patient_id)
        return {"count": count}
    except ImportError:
        return {"count": 0}

@app.put("/api/notifications/{notification_id}/read")
async def mark_read(notification_id: str, user: dict = Depends(require_auth)):
    """Mark a notification as read"""
    try:
        from notifications import mark_notification_read
        success = await mark_notification_read(notification_id, user["id"])
        return {"success": success}
    except ImportError:
        return {"success": True}

@app.put("/api/patients/{patient_id}/notifications/read-all")
async def mark_all_notifications_read(patient_id: str, user: dict = Depends(require_auth)):
    """Mark all notifications as read"""
    try:
        from notifications import mark_all_read
        await mark_all_read(patient_id)
        return {"success": True}
    except ImportError:
        return {"success": True}

@app.delete("/api/notifications/{notification_id}")
async def delete_notification_endpoint(notification_id: str, user: dict = Depends(require_auth)):
    """Delete a notification"""
    try:
        from notifications import delete_notification
        success = await delete_notification(notification_id, user["id"])
        return {"success": success}
    except ImportError:
        return {"success": True}

# --- DR. AEGIS INTELLIGENCE (LLM) ---

class ChatMessage(BaseModel):
    content: str


@app.get("/api/chat/session")
async def get_or_create_session(user: dict = Depends(require_auth)):
    """Get current active chat session or create new one"""
    try:
        from database import get_or_create_chat_session, get_chat_messages
        session = await get_or_create_chat_session(user["id"], "CHAT")
        if not session:
            raise HTTPException(status_code=500, detail="Failed to create session")
        
        # Get messages for this session
        messages = await get_chat_messages(session["id"])
        
        return {
            "session": session,
            "messages": messages
        }
    except ImportError:
        return {
            "session": {"id": "mock-session", "is_active": True},
            "messages": []
        }


@app.post("/api/chat/session/new")
async def create_new_session(user: dict = Depends(require_auth)):
    """Start a new chat session (ends current one)"""
    try:
        from database import create_new_chat_session
        session = await create_new_chat_session(user["id"], "CHAT")
        return {"session": session, "messages": []}
    except ImportError:
        return {"session": {"id": "mock-session-new", "is_active": True}, "messages": []}


@app.post("/api/chat/message")
async def send_chat_message(message: ChatMessage, user: dict = Depends(require_auth)):
    """Send message to Dr. Aegis and get response"""
    try:
        from database import (
            get_or_create_chat_session, 
            save_chat_message, 
            get_chat_history_for_context,
            get_patient
        )
        from gemini_client import get_dr_aegis_response
        
        # Get/create session
        session = await get_or_create_chat_session(user["id"], "CHAT")
        if not session:
            raise HTTPException(status_code=500, detail="Failed to get session")
        
        # Save user message
        user_msg = await save_chat_message(
            session["id"], 
            user["id"], 
            "user", 
            message.content
        )
        
        # Get chat history for context
        chat_history = await get_chat_history_for_context(session["id"])
        
        # Get patient context for personalization
        patient = await get_patient(user["id"])
        
        # Get Dr. Aegis response
        ai_response = await get_dr_aegis_response(
            message.content,
            chat_history=chat_history[:-1],  # Exclude the message we just sent
            patient_context=patient
        )
        
        # Save AI response
        ai_msg = await save_chat_message(
            session["id"],
            user["id"],
            "assistant",
            ai_response
        )
        
        return {
            "user_message": user_msg,
            "ai_message": ai_msg,
            "response": ai_response
        }
        
    except ImportError as e:
        # User-friendly fallback response
        print(f"❌ ImportError in chat endpoint: {e}")
        fallback_msg = """🩺 **Dr. Aegis is currently on a brief break.**

I'll be back online shortly to assist with your health questions. In the meantime:

• For **urgent symptoms**, please contact your healthcare provider
• For **emergencies**, call 911 immediately

Thank you for your patience! — Dr. Aegis"""
        return {
            "user_message": {"id": "temp", "content": message.content, "role": "user", "created_at": None},
            "ai_message": {"id": "temp-ai", "content": fallback_msg, "role": "assistant", "created_at": None},
            "response": fallback_msg
        }
    except Exception as e:
        print(f"❌ General error in chat endpoint: {e}")
        import traceback
        traceback.print_exc()
        fallback_msg = """🩺 **Dr. Aegis is temporarily unavailable.**

I'm experiencing a brief technical hiccup, but I'll be back soon! For now:

• **Non-urgent questions**: Try again in a moment
• **Urgent concerns**: Contact your healthcare provider
• **Emergencies**: Call 911 immediately

Your health matters! — Dr. Aegis"""
        return {
            "user_message": {"id": "temp", "content": message.content, "role": "user", "created_at": None},
            "ai_message": {"id": "temp-ai", "content": fallback_msg, "role": "assistant", "created_at": None},
            "response": fallback_msg
        }


@app.get("/api/chat/history/{session_id}")
async def get_chat_history(session_id: str, user: dict = Depends(require_auth)):
    """Get chat history for a session"""
    try:
        from database import get_chat_messages, get_chat_session
        
        # Verify session belongs to user
        session = await get_chat_session(session_id)
        if not session or session["patient_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Access denied")
        
        messages = await get_chat_messages(session_id)
        return {"messages": messages}
    except ImportError:
        return {"messages": []}

# --- REAL-TIME COMMUNICATION (WEBSOCKETS) ---

@app.websocket("/ws/risk-feed")
async def risk_feed_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            event = generate_risk_event()
            await websocket.send_text(event.model_dump_json())
            await asyncio.sleep(random.uniform(3, 8))
    except WebSocketDisconnect:
        print("Risk Feed client disconnected")

@app.websocket("/ws/vitals")
async def vitals_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            vitals = generate_mock_vitals()
            await websocket.send_text(json.dumps(vitals))
            await asyncio.sleep(2)
    except WebSocketDisconnect:
        print("Vitals client disconnected")

# Keep legacy echo endpoint for testing
@app.websocket("/ws")
async def websocket_echo(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            await websocket.send_text(f"Cortex received: {data}")
    except WebSocketDisconnect:
        print("Echo client disconnected")

# --- GEMINI LIVE API ---
@app.websocket("/ws/live-session")
async def live_session_endpoint(websocket: WebSocket, patient_id: Optional[str] = None):
    """
    WebSocket endpoint for real-time voice/video AI health sessions.
    
    Protocol:
    - Client sends: {"type": "audio", "data": "<base64>", "sample_rate": 16000}
    - Client sends: {"type": "video", "data": "<base64>", "mime_type": "image/jpeg"}
    - Client sends: {"type": "end"} to close session
    
    - Server sends: {"type": "audio", "data": "<base64>"}
    - Server sends: {"type": "text", "content": "<text>"}
    - Server sends: {"type": "status", "status": "connected|error|ended"}
    """
    await websocket.accept()
    print(f"🎤 Live session WebSocket connected (Patient ID: {patient_id})")
    
    # 1. Fetch Patient Context if ID provided
    # Sanitize inputs from frontend
    if patient_id in ["undefined", "null", "None", ""]:
        patient_id = None

    patient_context = ""
    if patient_id:
        print(f"🔍 Fetching context for patient: {patient_id}")
        try:
            from database import get_patient_context_string
            patient_context = await get_patient_context_string(patient_id)
            if "Patient data not found" in patient_context or len(patient_context) < 50:
                 print(f"⚠️ Warning: Weak context loaded: {patient_context}")
            else:
                 print(f"📄 Context loaded ({len(patient_context)} chars): {patient_context[:100]}...")
        except Exception as e:
            print(f"⚠️ Failed to load context: {e}")
            # Continue without context rather than failing
    else:
        print("⚠️ No patient_id provided (received None/undefined), using generic context")

    # 2. Initialize Gemini Session
    session = None
    transcript = []
    started_at = datetime.now()
    
    try:
        from live_session import DrAegisLiveSession, GENAI_AVAILABLE
        if not GENAI_AVAILABLE:
            await websocket.send_json({"type": "error", "message": "Live API not available"})
            await websocket.close()
            return

        # Initialize session with context
        session = DrAegisLiveSession(enable_video=False, patient_context=patient_context)
        
        # Define callbacks
        async def on_audio(data: bytes):
            # Encode audio to base64 for frontend
            import base64
            b64_data = base64.b64encode(data).decode('utf-8')
            msg = {"type": "audio", "data": b64_data}
            if websocket.client_state.name == "CONNECTED":
                await websocket.send_text(json.dumps(msg))
        
        async def on_text(text: str):
            # Capture transcript
            transcript.append(text)
            
            # Send text transcript/response to frontend
            msg = {"type": "text", "content": text}
            if websocket.client_state.name == "CONNECTED":
                await websocket.send_text(json.dumps(msg))

        # Connect to Gemini
        print("🚀 Connecting to Gemini Live API...")
        await session.connect(on_audio=on_audio, on_text=on_text)
        await websocket.send_json({"type": "status", "status": "connected"})
        print("✅ Gemini Live API connected")
        
        # 3. Main Loop
        try:
            while True:
                # Receive message from client
                data = await websocket.receive_text()
                message = json.loads(data)
                
                msg_type = message.get("type")
                
                if msg_type == "config":
                    enable_video = message.get("enable_video", False)
                    if session:
                        session.enable_video = enable_video
                    print(f"⚙️ Session config updated: video={enable_video}")
                    continue
                    
                if msg_type == "audio":
                    # Decode base64 audio
                    audio_b64 = message.get("data")
                    if audio_b64:
                        import base64
                        audio_data = base64.b64decode(audio_b64)
                        await session.send_audio(audio_data)
                    
                elif msg_type == "video":
                    # Handle video frames
                    video_b64 = message.get("data")
                    mime_type = message.get("mime_type", "image/jpeg")
                    if video_b64:
                        await session.send_video_frame_base64(video_b64, mime_type)
                    
                elif msg_type == "end":
                    print("🎤 Client ended session")
                    break
                    
        except WebSocketDisconnect:
            print("🎤 Client disconnected")
        except Exception as e:
            print(f"❌ Error in live session loop: {e}")
            import traceback
            traceback.print_exc()
            
    except Exception as e:
        print(f"❌ Error initializing live session: {e}")
        import traceback
        traceback.print_exc()
        if websocket.client_state.name == "CONNECTED":
            try:
                await websocket.send_json({"type": "error", "message": str(e)})
            except:
                pass
    finally:
        print("🎤 Live session ended - Cleaning up...")
        ended_at = datetime.now()
        
        # Save session log if there is a transcript and patient_id
        if transcript and patient_id:
            print(f"💾 Saving session log ({len(transcript)} turns)...")
            try:
                from database import save_session_log
                full_transcript = "\n\nDr. Aegis: ".join(transcript)
                # Ensure we add "Dr. Aegis:" to the first line too
                if full_transcript:
                    full_transcript = "Dr. Aegis: " + full_transcript
                    
                session_data = await save_session_log(patient_id, started_at, ended_at, full_transcript)
                if session_data and websocket.client_state.name == "CONNECTED":
                    await websocket.send_json({
                        "type": "summary",
                        "data": session_data
                    })
            except Exception as e:
                # Only log if it's not a closed connection error
                if websocket.client_state.name == "CONNECTED":
                    print(f"❌ Failed to send session summary: {type(e).__name__} - {str(e)}")
                else:
                    print(f"ℹ️ Session summary generated but client disconnected: {str(e)}")
        else:
            print("ℹ️ No transcript to save or missing patient ID")
            
        if session:
            try:
                # Disconnect session if method exists (cleanup)
                pass 
            except:
                pass
        print("✅ Cleanup complete")

# --- PATIENT TASKS ---

class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    assigned_by: Optional[str] = "SELF"


@app.get("/api/patients/{patient_id}/tasks")
async def get_patient_tasks(patient_id: str, user: dict = Depends(require_auth)):
    """Get all tasks for a patient"""
    try:
        from database import get_tasks
        return await get_tasks(patient_id)
    except ImportError:
        return []


@app.post("/api/patients/{patient_id}/tasks")
async def create_new_task(patient_id: str, task: TaskCreate, user: dict = Depends(require_auth)):
    """Create a new task"""
    try:
        from database import create_task
        return await create_task(patient_id, task.title, task.description, task.assigned_by)
    except ImportError:
        return {"id": "mock-task"}


@app.put("/api/tasks/{task_id}/status")
async def update_task_status_endpoint(task_id: str, status: str, user: dict = Depends(require_auth)):
    """Update task status"""
    try:
        from database import update_task_status
        success = await update_task_status(task_id, status)
        return {"success": success}
    except ImportError:
        return {"success": True}


