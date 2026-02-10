"""
Dr. Aegis - AegisMedix AI Medical Sentinel
Gemini-powered medical assistant for patient consultation
"""
import os
from typing import Optional
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

# Configure Gemini
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
print(f"🔑 GEMINI_API_KEY loaded: {'Yes' if GEMINI_API_KEY else 'No'}")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    print("✅ Gemini API configured")

# Dr. Aegis System Prompt
DR_AEGIS_SYSTEM_PROMPT = """You are Dr. Aegis, the AI Medical Sentinel for AegisMedix — an advanced medical AI assistant specializing in post-operative care, medication management, and patient recovery guidance.

## YOUR IDENTITY
- Name: Dr. Aegis
- Role: AI Medical Sentinel & Virtual Physician Assistant
- Specialty: Post-operative recovery, medication management, symptom triage

## PERSONA & TONE
- Speak as a warm, professional physician conducting a consultation
- Be empathetic, reassuring, but clinically precise
- Use clear, accessible language (avoid excessive medical jargon unless explaining)
- Address the patient respectfully and make them feel heard
- Be concise but thorough — like a good doctor who respects your time

## CORE CAPABILITIES
1. **Medication Guidance**: Dosage reminders, interaction warnings, timing advice
2. **Recovery Monitoring**: Track progress, assess symptoms, identify red flags
3. **Symptom Assessment**: Triage concerns, recommend action levels
4. **Health Education**: Explain conditions, procedures, and aftercare
5. **Emotional Support**: Acknowledge anxiety, provide reassurance

## SAFETY PROTOCOLS (CRITICAL)
- ⚠️ NEVER provide definitive diagnoses — always recommend professional consultation for concerning symptoms
- ⚠️ For emergencies (chest pain, severe bleeding, difficulty breathing, stroke symptoms), immediately respond: "⚠️ SEEK IMMEDIATE MEDICAL CARE - Call emergency services or go to the nearest ER"
- Always recommend contacting their healthcare provider for significant health changes
- When uncertain, err on the side of caution and recommend professional evaluation
- Cite general medical guidelines when providing advice

## RESPONSE FORMAT
- Start with acknowledgment of patient's concern
- Provide clear, actionable guidance
- End with appropriate follow-up recommendation or reassurance
- Keep responses focused and relevant (typically 2-4 paragraphs)

## CONTEXT AWARENESS
You have access to the patient's profile and medical history when provided. Use this context to personalize your responses while maintaining privacy.

Remember: You are a trusted medical companion helping patients navigate their recovery journey safely. Your role is to support, educate, and protect — never to replace their healthcare team."""


class DrAegis:
    """Dr. Aegis AI Medical Sentinel"""
    
    def __init__(self):
        self.model_name = "gemini-flash-lite-latest"
        self.model = None
        self._initialize_model()
    
    def _initialize_model(self):
        """Initialize Gemini model"""
        if not GEMINI_API_KEY:
            print("Warning: GEMINI_API_KEY not set. Dr. Aegis will use fallback responses.")
            return
        
        try:
            self.model = genai.GenerativeModel(
                model_name=self.model_name,
                system_instruction=DR_AEGIS_SYSTEM_PROMPT,
                generation_config={
                    "temperature": 0.7,
                    "top_p": 0.9,
                    "max_output_tokens": 1024,
                }
            )
            print(f"✅ Dr. Aegis initialized with model: {self.model_name}")
        except Exception as e:
            print(f"❌ Failed to initialize Gemini model: {e}")
    
    async def get_response(
        self,
        message: str,
        chat_history: list[dict] = None,
        patient_context: dict = None
    ) -> str:
        """
        Get Dr. Aegis response to patient message
        
        Args:
            message: Patient's message
            chat_history: Previous messages in format [{"role": "user/assistant", "content": "..."}]
            patient_context: Patient profile data for personalization
        """
        if not self.model:
            return self._fallback_response(message)
        
        try:
            # Build context-aware prompt
            context_prefix = ""
            if patient_context:
                context_prefix = self._build_patient_context(patient_context)
            
            # Build conversation history for multi-turn
            history = []
            if chat_history:
                for msg in chat_history[-10:]:  # Last 10 messages for context
                    role = "user" if msg["role"] == "user" else "model"
                    history.append({"role": role, "parts": [msg["content"]]})
            
            # Create chat session
            chat = self.model.start_chat(history=history)
            
            # Send message with context
            full_message = f"{context_prefix}\n\nPatient: {message}" if context_prefix else message
            response = chat.send_message(full_message)
            
            return response.text
            
        except Exception as e:
            print(f"Dr. Aegis error: {e}")
            return self._fallback_response(message)
    
    def _build_patient_context(self, patient: dict) -> str:
        """Build patient context string for personalized responses"""
        context_parts = ["[PATIENT CONTEXT - Use for personalization]"]
        
        if patient.get("full_name"):
            context_parts.append(f"- Name: {patient['full_name']}")
        if patient.get("blood_type"):
            context_parts.append(f"- Blood Type: {patient['blood_type']}")
        if patient.get("allergies"):
            context_parts.append(f"- Known Allergies: {patient['allergies']}")
        if patient.get("recovery_protocol"):
            context_parts.append(f"- Recovery Protocol: {patient['recovery_protocol']}")
        if patient.get("recovery_start_date"):
            context_parts.append(f"- Recovery Started: {patient['recovery_start_date']}")
        
        return "\n".join(context_parts) if len(context_parts) > 1 else ""
    
    def _fallback_response(self, message: str) -> str:
        """Fallback response when Gemini is unavailable"""
        message_lower = message.lower()
        
        # Emergency detection
        emergency_keywords = ["chest pain", "can't breathe", "severe bleeding", "stroke", "heart attack"]
        if any(kw in message_lower for kw in emergency_keywords):
            return "⚠️ **SEEK IMMEDIATE MEDICAL CARE** - Based on your symptoms, please call emergency services (911) or go to the nearest emergency room immediately. Do not delay."
        
        # General fallback
        return """I'm Dr. Aegis, your AI Medical Sentinel.

I'm experiencing a temporary connection issue. Please try your message again in a moment.

For immediate health concerns:
• **Urgent symptoms**: Contact your doctor or visit urgent care
• **Emergencies**: Call 911 immediately

I'll be fully available shortly. Thank you for your patience."""


# Global instance
dr_aegis = DrAegis()


async def get_dr_aegis_response(
    message: str,
    chat_history: list[dict] = None,
    patient_context: dict = None
) -> str:
    """Convenience function to get Dr. Aegis response"""
    return await dr_aegis.get_response(message, chat_history, patient_context)
