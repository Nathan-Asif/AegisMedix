"""
Notifications module for AegisMedix
"""
from database import get_supabase_client


async def get_patient_notifications(patient_id: str, limit: int = 20) -> list:
    """Get notifications for a patient"""
    client = get_supabase_client()
    response = (
        client.table("notifications")
        .select("*")
        .eq("patient_id", patient_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return response.data or []


async def get_unread_count(patient_id: str) -> int:
    """Get count of unread notifications"""
    client = get_supabase_client()
    response = (
        client.table("notifications")
        .select("id", count="exact")
        .eq("patient_id", patient_id)
        .eq("is_read", False)
        .execute()
    )
    return response.count or 0


async def mark_notification_read(notification_id: str, patient_id: str) -> bool:
    """Mark a notification as read"""
    client = get_supabase_client()
    response = (
        client.table("notifications")
        .update({"is_read": True})
        .eq("id", notification_id)
        .eq("patient_id", patient_id)
        .execute()
    )
    return len(response.data) > 0 if response.data else False


async def mark_all_read(patient_id: str) -> bool:
    """Mark all notifications as read for a patient"""
    client = get_supabase_client()
    response = (
        client.table("notifications")
        .update({"is_read": True})
        .eq("patient_id", patient_id)
        .eq("is_read", False)
        .execute()
    )
    return True


async def delete_notification(notification_id: str, patient_id: str) -> bool:
    """Delete a notification"""
    client = get_supabase_client()
    response = (
        client.table("notifications")
        .delete()
        .eq("id", notification_id)
        .eq("patient_id", patient_id)
        .execute()
    )
    return len(response.data) > 0 if response.data else False


async def create_notification(
    patient_id: str,
    title: str,
    message: str = None,
    notification_type: str = "INFO"
) -> dict:
    """Create a new notification"""
    client = get_supabase_client()
    response = client.table("notifications").insert({
        "patient_id": patient_id,
        "title": title,
        "message": message,
        "type": notification_type
    }).execute()
    return response.data[0] if response.data else None


import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

async def send_email_reminder(to_email: str, subject: str, body: str):
    """Send an email reminder via SMTP"""
    host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    port = int(os.getenv("SMTP_PORT", 587))
    user = os.getenv("SMTP_USER")
    password = os.getenv("SMTP_PASS")
    
    if not user or not password:
        print("⚠️ SMTP credentials missing. Skipping email.")
        return False
        
    try:
        msg = MIMEMultipart()
        msg['From'] = user
        msg['To'] = to_email
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'plain'))
        
        # Use a non-blocking way or run in thread for standard smtplib
        import asyncio
        loop = asyncio.get_event_loop()
        
        def _send():
            with smtplib.SMTP(host, port) as server:
                server.starttls()
                server.login(user, password)
                server.send_message(msg)
                
        await loop.run_in_executor(None, _send)
        print(f"📧 Email sent to {to_email}")
        return True
    except Exception as e:
        print(f"❌ Failed to send email: {e}")
        return False
