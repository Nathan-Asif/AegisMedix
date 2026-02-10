"""
Supabase Database Client for AegisMedix Cortex
"""
import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")  # Use service key for backend

supabase: Client | None = None

def get_supabase_client() -> Client:
    """Get or create Supabase client singleton"""
    global supabase
    if supabase is None:
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env")
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    return supabase

# --- PATIENT OPERATIONS ---

async def get_patient(patient_id: str) -> dict | None:
    """Fetch patient by ID"""
    client = get_supabase_client()
    response = client.table("patients").select("*").eq("id", patient_id).single().execute()
    return response.data


async def update_patient(patient_id: str, data: dict):
    """Update patient profile"""
    client = get_supabase_client()
    # Only allow updating specific fields
    allowed_fields = [
        "full_name", "phone", "emergency_contact", "emergency_number", 
        "blood_type", "allergies", "avatar_url", "date_of_birth",
        "diagnosis", "recovery_protocol", 
        "recovery_start_date", "recovery_duration_days",
        "email_reminders_enabled", "in_app_reminders_enabled"
    ]
    update_data = {k: v for k, v in data.items() if k in allowed_fields}
    
    if not update_data:
        return None
    
    response = (
        client.table("patients")
        .update(update_data)
        .eq("id", patient_id)
        .execute()
    )
    return response.data[0] if response.data else None

async def reset_recovery(patient_id: str):
    """Reset the recovery start date to now"""
    client = get_supabase_client()
    from datetime import datetime
    return client.table("patients").update({
        "recovery_start_date": datetime.now().isoformat()
    }).eq("id", patient_id).execute()

async def clear_recovery(patient_id: str):
    """Clear recovery diagnosis and protocol"""
    client = get_supabase_client()
    return client.table("patients").update({
        "diagnosis": None,
        "recovery_protocol": None,
        "recovery_start_date": None,
        "recovery_duration_days": None
    }).eq("id", patient_id).execute()


async def update_avatar_url(patient_id: str, avatar_url: str) -> dict | None:
    """Update patient avatar URL"""
    client = get_supabase_client()
    response = (
        client.table("patients")
        .update({"avatar_url": avatar_url})
        .eq("id", patient_id)
        .execute()
    )
    return response.data[0] if response.data else None


async def get_patient_by_email(email: str) -> dict | None:
    """Fetch patient by email"""
    client = get_supabase_client()
    response = client.table("patients").select("*").eq("email", email).single().execute()
    return response.data

# --- VITALS OPERATIONS ---

async def get_latest_vitals(patient_id: str) -> dict | None:
    """Get most recent vitals for a patient"""
    try:
        client = get_supabase_client()
        response = (
            client.table("vitals")
            .select("*")
            .eq("patient_id", patient_id)
            .order("recorded_at", desc=True)
            .limit(1)
            .execute()
        )
        if response and response.data and len(response.data) > 0:
            return response.data[0]
        return None
    except Exception as e:
        print(f"Error fetching vitals: {e}")
        return None


async def insert_vitals(patient_id: str, heart_rate: int, spo2: int, sleep_hours: float) -> dict:
    """Insert new vitals reading"""
    client = get_supabase_client()
    response = client.table("vitals").insert({
        "patient_id": patient_id,
        "heart_rate": heart_rate,
        "heart_rate_status": "STABLE" if 60 <= heart_rate <= 100 else "ELEVATED",
        "spo2_level": spo2,
        "spo2_status": "OPTIMAL" if spo2 >= 95 else "LOW",
        "sleep_hours": sleep_hours,
        "sleep_status": "GOOD" if sleep_hours >= 7 else "FAIR"
    }).execute()
    return response.data

# --- MEDICATIONS OPERATIONS ---

async def get_patient_medications(patient_id: str) -> list:
    """Get all medications for a patient"""
    client = get_supabase_client()
    response = (
        client.table("medications")
        .select("*")
        .eq("patient_id", patient_id)
        .order("scheduled_time")
        .execute()
    )
    return response.data or []


async def get_todays_medication_schedule(patient_id: str) -> list:
    """Get today's comprehensive medication schedule (merged logs + pending)"""
    client = get_supabase_client()
    from datetime import datetime, date
    
    # 1. Get all medications
    meds_res = (
        client.table("medications")
        .select("*")
        .eq("patient_id", patient_id)
        .execute()
    )
    meds = meds_res.data or []
    
    # 2. Get today's logs
    today_start = datetime.now().replace(hour=0, minute=0, second=0).isoformat()
    logs_res = (
        client.table("medication_logs")
        .select("*")
        .eq("patient_id", patient_id)
        .gte("scheduled_for", today_start)
        .execute()
    )
    logs = logs_res.data or []
    
    # 3. Merge
    schedule = []
    for m in meds:
        # Find if logged
        log = next((l for l in logs if l['medication_id'] == m['id']), None)
        
        if log:
            schedule.append({
                "id": log['id'],
                "medication_id": m['id'],
                "medication": m,
                "status": log['status'],
                "scheduled_for": log['scheduled_for'] 
            })
        else:
            # Create UPCOMING entry
            # Construct ISO string for today + scheduled_time
            time_str = m.get('scheduled_time', '09:00:00')
            try:
                t = datetime.strptime(time_str, "%H:%M:%S").time()
                scheduled_dt = datetime.combine(date.today(), t)
            except:
                scheduled_dt = datetime.now() # Fallback

            schedule.append({
                "id": f"pending_{m['id']}", 
                "medication_id": m['id'], # ID needed for logging
                "medication": m,
                "status": "UPCOMING",
                "scheduled_for": scheduled_dt.isoformat()
            })
            
    # Sort by time
    schedule.sort(key=lambda x: x['scheduled_for'])
    return schedule

    return schedule


async def delete_medication(medication_id: str, patient_id: str) -> bool:
    """Delete a medication and its schedule/logs"""
    client = get_supabase_client()
    try:
        response = (
            client.table("medications")
            .delete()
            .eq("id", medication_id)
            .eq("patient_id", patient_id)
            .execute()
        )
        return len(response.data) > 0 if response.data else False
    except Exception as e:
        print(f"Error deleting medication: {e}")
        return False


async def log_medication_taken(medication_id: str, patient_id: str) -> dict:
    """Log that a medication was taken"""
    client = get_supabase_client()
    from datetime import datetime
    
    # Check if a log already exists for today to avoid duplicates?
    # For now, let's just log it.
    
    response = client.table("medication_logs").insert({
        "patient_id": patient_id,
        "medication_id": medication_id,
        "status": "TAKEN",
        "scheduled_for": datetime.now().isoformat() # Ideally we'd match the schedule time
    }).execute()
    
    # Create Activity Log
    try:
        # Fetch med name for log
        med_res = client.table("medications").select("name").eq("id", medication_id).execute()
        med_name = med_res.data[0]['name'] if med_res.data else "Medication"
        
        await create_activity_log(
            patient_id, 
            "medication", 
            "Medication Taken", 
            f"Took {med_name}", 
            "INFO"
        )
    except:
        pass
        
    return response.data[0] if response.data else None


async def delete_medication_log(log_id: str) -> bool:
    """Delete a medication log entry (untake)"""
    client = get_supabase_client()
    try:
        response = (
            client.table("medication_logs")
            .delete()
            .eq("id", log_id)
            .execute()
        )
        return len(response.data) > 0 if response.data else False
    except Exception as e:
        print(f"Error deleting med log: {e}")
        return False

async def add_and_log_medication(patient_id: str, name: str, dosage: str = "As needed", status: str = "TAKEN"):
    """Proactively add a medication to the patient's record and log it"""
    client = get_supabase_client()
    # 1. Create the medication record
    try:
        med_res = client.table("medications").insert({
            "patient_id": patient_id,
            "name": name,
            "dosage": dosage,
            "frequency": "As needed",
            "scheduled_time": "12:00:00",
            "category": "Recovery Advice"
        }).execute()
        
        if med_res.data:
            med_id = med_res.data[0]["id"]
            # 2. Log it as taken
            await log_medication_taken(med_id, patient_id)
            return med_res.data[0]
    except Exception as e:
        print(f"Error adding proactive medication: {e}")
    return None

# --- ACTIVITY LOG OPERATIONS ---

async def get_activity_logs(patient_id: str, limit: int = 10) -> list:
    """Get recent activity logs for a patient"""
    client = get_supabase_client()
    response = (
        client.table("activity_logs")
        .select("*")
        .eq("patient_id", patient_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return response.data or []


async def create_activity_log(
    patient_id: str, 
    event_type: str, 
    title: str, 
    description: str,
    severity: str = "INFO"
) -> dict:
    """Create a new activity log entry"""
    client = get_supabase_client()
    response = client.table("activity_logs").insert({
        "patient_id": patient_id,
        "event_type": event_type,
        "title": title,
        "description": description,
        "severity": severity
    }).execute()
    return response.data

# --- SESSION OPERATIONS ---

async def create_session(patient_id: str, session_type: str) -> dict:
    """Start a new AI session"""
    client = get_supabase_client()
    response = client.table("sessions").insert({
        "patient_id": patient_id,
        "session_type": session_type
    }).execute()
    return response.data


async def end_session(session_id: str, summary: str, ai_insights: str) -> dict:
    """End a session and save summary"""
    client = get_supabase_client()
    from datetime import datetime
    response = (
        client.table("sessions")
        .update({
            "ended_at": datetime.now().isoformat(),
            "summary": summary,
            "ai_insights": ai_insights
        })
        .eq("id", session_id)
        .execute()
    )
    return response.data

# --- CHAT SESSION OPERATIONS ---

async def get_or_create_chat_session(patient_id: str, session_type: str = "CHAT") -> dict:
    """Get active chat session or create new one"""
    client = get_supabase_client()
    
    # Try to find active session
    response = (
        client.table("chat_sessions")
        .select("*")
        .eq("patient_id", patient_id)
        .eq("session_type", session_type)
        .eq("is_active", True)
        .order("started_at", desc=True)
        .limit(1)
        .execute()
    )
    
    if response.data and len(response.data) > 0:
        return response.data[0]
    
    # Create new session
    new_session = client.table("chat_sessions").insert({
        "patient_id": patient_id,
        "session_type": session_type,
        "is_active": True
    }).execute()
    
    return new_session.data[0] if new_session.data else None


async def create_new_chat_session(patient_id: str, session_type: str = "CHAT") -> dict:
    """Create a new chat session (deactivates previous ones)"""
    client = get_supabase_client()
    from datetime import datetime
    
    # Deactivate previous sessions of same type
    client.table("chat_sessions").update({
        "is_active": False,
        "ended_at": datetime.now().isoformat()
    }).eq("patient_id", patient_id).eq("session_type", session_type).eq("is_active", True).execute()
    
    # Create new session
    new_session = client.table("chat_sessions").insert({
        "patient_id": patient_id,
        "session_type": session_type,
        "is_active": True
    }).execute()
    
    return new_session.data[0] if new_session.data else None


async def get_chat_session(session_id: str) -> dict | None:
    """Get chat session by ID"""
    client = get_supabase_client()
    response = client.table("chat_sessions").select("*").eq("id", session_id).single().execute()
    return response.data

# --- CHAT MESSAGE OPERATIONS ---

async def get_chat_messages(session_id: str, limit: int = 50) -> list:
    """Get messages for a chat session"""
    client = get_supabase_client()
    response = (
        client.table("chat_messages")
        .select("*")
        .eq("session_id", session_id)
        .order("created_at", desc=False)
        .limit(limit)
        .execute()
    )
    return response.data or []


async def save_chat_message(session_id: str, patient_id: str, role: str, content: str) -> dict:
    """Save a chat message"""
    client = get_supabase_client()
    response = client.table("chat_messages").insert({
        "session_id": session_id,
        "patient_id": patient_id,
        "role": role,
        "content": content
    }).execute()
    return response.data[0] if response.data else None


async def get_chat_history_for_context(session_id: str, limit: int = 20) -> list:
    """Get recent chat history formatted for AI context"""
    messages = await get_chat_messages(session_id, limit)
    return [{"role": msg["role"], "content": msg["content"]} for msg in messages]

# --- AI CONTEXT AGGREGATION ---

async def get_recent_messages(patient_id: str, limit: int = 10) -> list:
    """Get recent chat messages for context"""
    client = get_supabase_client()
    try:
        response = (
            client.table("chat_messages")
            .select("*")
            .eq("patient_id", patient_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return response.data[::-1] if response.data else [] # Return in chronological order
    except Exception as e:
        print(f"Error fetching messages: {e}")
        return []

async def get_patient_context_string(patient_id: str) -> str:
    """
    Aggregate all patient data into a context string for the AI.
    Includes: Profile, Vitals, Medications, Recent Sessions.
    """
    from datetime import datetime, date
    import asyncio
    
    try:
        # Fetch patient profile first (critical)
        patient = await get_patient(patient_id)
        if not patient:
            print(f"⚠️ Patient not found for ID: {patient_id}")
            return "Patient data not found in database."
        
        print(f"✅ Found patient: {patient.get('full_name', 'Unknown')}")
        
        # Calculate age from date_of_birth if available
        age_str = "Unknown"
        dob = patient.get('date_of_birth')
        if dob:
            try:
                if isinstance(dob, str):
                    dob = datetime.strptime(dob, "%Y-%m-%d").date()
                today = date.today()
                age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
                age_str = str(age)
            except Exception as e:
                print(f"❌ Failed to calculate age: {e}")

        # Parallel fetch for all other context data
        async def safe_get_sessions():
            try:
                client = get_supabase_client()
                response = (
                    client.table("sessions")
                    .select("summary, ai_insights, started_at")
                    .eq("patient_id", patient_id)
                    .order("started_at", desc=True)
                    .limit(3)
                    .execute()
                )
                return response.data or []
            except Exception as e:
                print(f"Error fetching sessions: {e}")
                return []

        # Run checks in parallel
        vitals, meds, recent_chat, recent_sessions = await asyncio.gather(
            get_latest_vitals(patient_id),
            get_patient_medications(patient_id),
            get_recent_messages(patient_id, limit=10),
            safe_get_sessions(),
            return_exceptions=True
        )

        # Handle potential exceptions from gather
        vitals = vitals if not isinstance(vitals, Exception) else None
        meds = meds if not isinstance(meds, Exception) else []
        recent_chat = recent_chat if not isinstance(recent_chat, Exception) else []
        recent_sessions = recent_sessions if not isinstance(recent_sessions, Exception) else []
        
        # Build context string with ALL patient profile fields (Privacy filtered)
        context = f"""
PATIENT PROFILE:
Name: {patient.get('full_name', 'Unknown')}
Date of Birth: {patient.get('date_of_birth', 'Not provided')}
Age: {age_str}
Blood Type: {patient.get('blood_type', 'Not specified')}
Allergies: {patient.get('allergies', 'None known')}
Recovery Protocol: {patient.get('recovery_protocol', 'None')}
VIP Status: {'Yes' if patient.get('is_vip') else 'No'}

LATEST VITALS:
Heart Rate: {vitals.get('heart_rate') if vitals else 'N/A'} bpm (Status: {vitals.get('heart_rate_status') if vitals else 'N/A'})
SpO2: {vitals.get('spo2_level') if vitals else 'N/A'}% (Status: {vitals.get('spo2_status') if vitals else 'N/A'})
Sleep: {vitals.get('sleep_hours') if vitals else 'N/A'} hours (Status: {vitals.get('sleep_status') if vitals else 'N/A'})

MEDICATIONS:
"""
        if meds:
            for m in meds:
                context += f"- {m.get('name', 'Unknown')}: {m.get('dosage', '')} ({m.get('frequency', '')} at {m.get('scheduled_time', 'N/A')})\n"
        else:
            context += "No medications on record.\n"
        
        # Add recent chat history from /chat for context continuity
        if recent_chat:
            context += "\nRECENT CHAT CONVERSATION HISTORY:\n"
            for msg in recent_chat:
                # Determine sender based on message structure
                sender = "Patient" if msg.get('is_user') or msg.get('role') == 'user' else "Dr. Aegis"
                content = msg.get('content', '') or msg.get('text', '')
                if isinstance(content, dict):
                    content = content.get('text', str(content))
                if content:
                    # Truncate very long messages
                    if len(content) > 200:
                        content = content[:200] + "..."
                    context += f"{sender}: {content}\n"
        
        # Add recent session summaries if available
        if recent_sessions:
            context += "\nPREVIOUS AI SESSION SUMMARIES:\n"
            for session in recent_sessions:
                summary = session.get('summary') or session.get('ai_insights')
                if summary:
                    context += f"- {summary}\n"
        
        print(f"📄 Built context with {len(context)} chars")
        return context
        
    except Exception as e:
        print(f"Error building patient context: {e}")
        import traceback
        traceback.print_exc()
        return f"Error retrieving patient context: {str(e)}"


async def save_session_log(patient_id: str, started_at, ended_at, transcript: str):
    """Save session log, generate summary, and update patient vitals/logs"""
    from datetime import datetime
    import json
    client = get_supabase_client()
    
    # Calculate duration
    if isinstance(started_at, str):
        started_at = datetime.fromisoformat(started_at)
    if isinstance(ended_at, str):
        ended_at = datetime.fromisoformat(ended_at)
        
    duration = (ended_at - started_at).total_seconds()
    
    # Generate AI summary with structured data
    summary, insights, extracted_vitals, extracted_meds, diagnosis, protocol = await generate_session_summary(transcript)
    
    # Pre-process Vitals for session storage
    hr = None
    spo2 = None
    if extracted_vitals:
        current_vitals = await get_latest_vitals(patient_id) or {}
        hr = extracted_vitals.get('heart_rate') or current_vitals.get('heart_rate') or 70
        spo2 = extracted_vitals.get('spo2_level') or current_vitals.get('spo2_level') or 98
        sleep = extracted_vitals.get('sleep_hours') or current_vitals.get('sleep_hours') or 8.0
        
        if hr and 30 < hr < 200:
            await insert_vitals(patient_id, int(hr), int(spo2), float(sleep))
            await create_activity_log(
                patient_id, 
                "SENSOR", 
                "Vitals Updated via AI", 
                f"Updated: HR {hr} bpm, SpO2 {spo2}%"
            )

    try:
        # 1. Save Session (Including Vitals now)
        data = {
            "patient_id": patient_id,
            "started_at": started_at.isoformat(),
            "ended_at": ended_at.isoformat(),
            "duration_seconds": int(duration),
            "session_type": "VOICE",
            "summary": summary,
            "ai_insights": insights,
            "heart_rate": int(hr) if hr else None,
            "spo2_level": int(spo2) if spo2 else None
        }
        
        client.table("sessions").insert(data).execute()
        print(f"✅ Session saved for patient {patient_id}")
        
        # 3. Process Medications
        if extracted_meds:
            print(f"💊 Processing extracted meds: {extracted_meds}")
            med_summary = ", ".join([f"{m.get('name')} ({m.get('status')})" for m in extracted_meds])
            await create_activity_log(
                patient_id,
                "MEDICATION",
                "Medication Update",
                f"AI Detected: {med_summary}"
            )
            
            # Attempt to match and log concrete medication logs
            try:
                patient_meds = await get_patient_medications(patient_id)
                for med_update in extracted_meds:
                    if med_update.get("status", "").upper() == "TAKEN":
                        # Fuzzy match name - More robust logic
                        target_name = med_update.get("name", "").lower()
                        matched = False
                        for pm in patient_meds:
                            pm_name = pm.get("name", "").lower()
                            # Match if either is a substring of the other (e.g. "Panadol" matches "Panadol (Canadol)")
                            if pm_name in target_name or target_name in pm_name:
                                await log_medication_taken(pm["id"], patient_id)
                                matched = True
                                break
                        
                        if not matched:
                            print(f"⚠️ Could not find exact match for {med_update.get('name')}. Adding proactively.")
                            await add_and_log_medication(patient_id, med_update.get("name"))
            except Exception as e:
                print(f"Error matching medications: {e}")

        # 4. Agentic Recovery Update: If a diagnosis is found, update the patient record
        if summary and not summary.lower().startswith("short session"):
            try:
                # Get current patient to see if diagnosis is actually new
                patient = await get_patient(patient_id)
                current_diagnosis = patient.get("diagnosis", "") if patient else ""
                
                update_data = {}
                if diagnosis and diagnosis.lower() != "none":
                    update_data["diagnosis"] = diagnosis
                if protocol and protocol.lower() != "none":
                    update_data["recovery_protocol"] = protocol
                
                if update_data:
                    # ONLY reset start date if the diagnosis is NEW or CHANGED
                    # This prevents resetting progress every time a session is summarized
                    new_diag = update_data.get("diagnosis", "").lower()
                    if new_diag and new_diag != (current_diagnosis or "").lower():
                        update_data["recovery_start_date"] = datetime.now().isoformat()
                        update_data["recovery_duration_days"] = 7 
                        
                    client.table("patients").update(update_data).eq("id", patient_id).execute()
                    print(f"🔄 Agentically updated recovery status for {patient_id}")
            except Exception as e:
                print(f"⚠️ Failed to agentically update recovery: {e}")

        # 5. Log Session Activity
        await create_activity_log(
            patient_id,
            "SESSION",
            "Health Check-in Completed",
            f"Summary: {summary[:100]}..."
        )
        
        print(f"✨ Session log process complete for {patient_id}")
        
        return {
            "summary": summary,
            "insights": insights,
            "vitals": extracted_vitals,
            "medications": extracted_meds,
            "diagnosis": diagnosis if diagnosis != "None" else None,
            "protocol": protocol if protocol != "None" else None
        }
    except Exception as e:
        print(f"❌ Error saving session: {e}")
        import traceback
        traceback.print_exc()
        return None

async def get_latest_session(patient_id: str) -> dict | None:
    """Fetch the most recent session summary for a patient"""
    client = get_supabase_client()
    response = (
        client.table("sessions")
        .select("*")
        .eq("patient_id", patient_id)
        .order("started_at", desc=True)
        .limit(1)
        .execute()
    )
    return response.data[0] if response.data else None


async def generate_session_summary(transcript: str) -> tuple[str, str, dict, list, str, str]:
    """
    Generate a medical summary, insights, and extract structured data (vitals, meds, diagnosis, protocol)
    from the session transcript using Gemini.
    Returns: (summary, insights, extracted_vitals, extracted_meds, diagnosis, protocol)
    """
    if not transcript or len(transcript) < 20:
        return "Short session.", "No significant insights.", {}, [], "None", "None"
        
    try:
        import os
        import json
        import re
        from google import genai
        
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            return "Summary unavailable", "API Key missing", {}, [], "None", "None"
            
        client = genai.Client(api_key=api_key)
        
        prompt = f"""
        Analyze this medical consultation transcript (Dr. Aegis output).
        
        TRANSCRIPT:
        {transcript}
        
        TASK:
        1. Summarize the session.
        2. Extract key medical insights.
        3. EXTRACT VITALS if mentioned (heart_rate, spo2_level, sleep_hours, weight, temperature).
           - Output integers/floats only.
           - heart_rate (bpm)
           - spo2_level (%)
           - sleep_hours (hours)
        5. IDENTIFYING SICKNESS: If the patient mentions symptoms (fever, pain, etc.), INFER a potential diagnosis and recovery protocol.
           - diagnosis: Keep it short (e.g., "Mild Fever", "Back Pain").
           - protocol: 1-2 sentences of advice (e.g., "Take Paracetamol every 6 hours, rest for 3 days.").
           - If no new sickness mentioned, use 'None' for both.
        
        OUTPUT FORMAT (JSON ONLY):
        {{
            "summary": "1-sentence summary",
            "insights": "Key bullet points",
            "vitals": {{
                "heart_rate": null, 
                "spo2_level": null,
                "sleep_hours": null
            }},
            "medications": [
                {{ "name": "Medicine", "status": "TAKEN/MISSED/NEW", "notes": "..." }}
            ],
            "diagnosis": "Condition Name or 'None'",
            "protocol": "Suggested recovery steps or 'None'"
        }}
        """
        
        # Use async generation
        response = await client.aio.models.generate_content(
            model="gemini-flash-latest",
            contents=prompt,
            config={"response_mime_type": "application/json"}
        )
        
        text = response.text
        # Clean up code blocks if present (though JSON mode usually avoids this)
        text = re.sub(r"```json|```", "", text).strip()
        
        try:
            data = json.loads(text)
            summary = data.get("summary", "Session completed.")
            insights = data.get("insights", "No insights extracted.")
            vitals_data = data.get("vitals", {})
            meds = data.get("medications", [])
            diagnosis = data.get("diagnosis", "None")
            protocol = data.get("protocol", "None")
            
            # Clean vitals (remove nulls)
            vitals = {k: v for k, v in vitals_data.items() if v is not None}
            
            return summary, insights, vitals, meds, diagnosis, protocol
            
        except json.JSONDecodeError:
            print(f"Failed to parse JSON summary: {text}")
            return "Session processed.", "Could not extract structured data.", {}, [], "None", "None"
        
    except Exception as e:
        print(f"Error generating summary: {e}")
        return "Processing error", "Could not generate insights.", {}, [], "None", "None"

# --- PATIENT TASKS ---
    """Get active tasks for a patient"""
    client = get_supabase_client()
    response = (
        client.table("tasks")
        .select("*")
        .eq("patient_id", patient_id)
        .order("created_at", desc=True)
        .execute()
    )
    return response.data or []


async def create_task(patient_id: str, title: str, description: str = "", assigned_by: str = "SELF") -> dict:
    """Create a new task for a patient"""
    client = get_supabase_client()
    data = {
        "patient_id": patient_id,
        "title": title,
        "description": description,
        "assigned_by": assigned_by,
        "status": "PENDING"
    }
    response = client.table("tasks").insert(data).execute()
    
    # Create an activity log for the new task
    await create_activity_log(
        patient_id,
        "MESSAGE",
        f"New Task Assigned ({assigned_by})",
        f"Task: {title}"
    )
    
    return response.data[0] if response.data else {}


async def update_task_status(task_id: str, status: str) -> bool:
    """Update the status of a task"""
    client = get_supabase_client()
    response = client.table("tasks").update({"status": status}).eq("id", task_id).execute()
    
    if response.data and status == "COMPLETED":
        # Log completion
        task = response.data[0]
        await create_activity_log(
            task["patient_id"],
            "MESSAGE",
            "Task Completed",
            f"Successfully finished: {task['title']}"
        )
        
def get_pending_reminders():
    """Find medications due for a reminder now (Synchronous)"""
    client = get_supabase_client()
    from datetime import datetime
    
    # 1. Get patients with email reminders enabled
    try:
        patients_res = client.table("patients").select("id, email, full_name").eq("email_reminders_enabled", True).execute()
        if not patients_res.data:
            return []
    except:
        # Table might not have the column yet if DB wasn't updated
        return []
    
    pending = []
    now = datetime.now()
    now_time = now.strftime("%H:%M:00")
    
    for patient in patients_res.data:
        # Get medications for this patient
        meds_res = client.table("medications").select("*").eq("patient_id", patient['id']).execute()
        for med in meds_res.data:
            # Check if scheduled time matches current HH:MM
            if med.get('scheduled_time') and med['scheduled_time'][:5] == now_time[:5]:
                # Check if already taken today
                today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
                try:
                    logs_res = client.table("medication_logs").select("id").eq("patient_id", patient['id']).eq("medication_id", med['id']).gt("created_at", today_start).execute()
                    
                    if not logs_res.data:
                        pending.append({
                            "patient_email": patient['email'],
                            "patient_name": patient['full_name'],
                            "med_name": med['name'],
                            "dosage": med['dosage'],
                            "scheduled_time": med['scheduled_time']
                        })
                except:
                    pass
    return pending
