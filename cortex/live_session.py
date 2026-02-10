"""
Gemini Live API Session Manager for real-time voice/video AI health sessions.
"""

import os
import asyncio
import json
import base64
from typing import Optional, Callable, Any
from dotenv import load_dotenv

load_dotenv()

# Check for new google-genai package
try:
    from google import genai
    from google.genai import types
    GENAI_AVAILABLE = True
    print("✅ google-genai package loaded for Live API")
except ImportError:
    GENAI_AVAILABLE = False
    print("⚠️ google-genai package not found - install with: pip install google-genai")


class DrAegisLiveSession:
    """
    Manages a real-time voice/video session with Dr. Aegis using Gemini 3 Live API.
    """
    
    # Gemini 2.5 Flash Native Audio - Latest Live model found in account
    MODEL = "gemini-2.5-flash-native-audio-latest"
    
    # Dr. Aegis system prompt - Optimized for Gemini 3's advanced reasoning
    SYSTEM_PROMPT = """You are Dr. Aegis, a state-of-the-art AI Medical Sentinel powered by Gemini 3. 

Your mission: Conduct a high-fidelity, real-time multimodal health consultation.

GEMINI 3 MULTIMODAL CAPABILITIES:
- **VISION**: You can SEE the patient. Actively observe their surroundings, their physical appearance, and any objects they show you.
- **REASONING**: Use your advanced reasoning to correlate visual cues (e.g., pale skin, tremors, specific pill colors) with their symptoms.
- **INTERACTION**: Be proactive. If you see something concerning, ask about it. 

CONSULTATION GUIDELINES:
1. **Identify Objects**: When shown a medication, identify the brand, dosage, and purpose immediately.
2. **Visual Assessment**: Describe physical symptoms you observe (e.g., "I notice a slight redness on your arm").
3. **Conversational Flow**: Keep responses brief (1-3 sentences) but deeply insightful.
4. **Safety First**: Always prioritize emergency protocols (dial 911) for life-threatening symptoms.

Dr. Aegis Personality: Professional, observant, empathetic, and technologically superior."""

    def __init__(self, enable_video: bool = False, patient_context: str = ""):
        """
        Initialize a live session with optional video support and patient context.
        
        Args:
            enable_video: Enable video capabilities if True
            patient_context: String containing patient profile, vitals, and chat history
        """
        self.enable_video = enable_video
        self.patient_context = patient_context
        self.client = None
        self.session = None
        self.session_context = None
        self.is_connected = False
        self.is_model_speaking = False  # Track if model is currently speaking
        self.on_audio_callback: Optional[Callable] = None
        self.on_text_callback: Optional[Callable] = None
        self._receive_task: Optional[asyncio.Task] = None
        
        if not GENAI_AVAILABLE:
            raise ImportError("google-genai package not installed")
        
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY not found in environment")
        
        self.client = genai.Client(api_key=api_key)
    
    async def connect(self, on_audio: Callable[[bytes], Any], on_text: Optional[Callable[[str], Any]] = None):
        """
        Connect to Gemini Live API and start receiving responses.
        
        Args:
            on_audio: Callback function that receives audio bytes (PCM 24kHz)
            on_text: Optional callback for text transcriptions
        """
        self.on_audio_callback = on_audio
        self.on_text_callback = on_text
        
        # Combine base prompt with patient context
        # Combine base prompt with patient context
        full_system_prompt = self.SYSTEM_PROMPT
        if self.patient_context:
            full_system_prompt += f"\n\n--- PATIENT CONTEXT ---\n{self.patient_context}\n\nINSTRUCTIONS:\n1. Greet the patient by name immediately.\n2. Confirm their age and check their vitals from the context.\n3. Use the context to ask relevant medical questions.\n4. Ignore background noise or other voices; focus only on the patient speaking to you directly."

        # Create proper config using types
        config = types.LiveConnectConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(
                        voice_name="Aoede"
                    )
                )
            ),
            system_instruction=types.Content(
                parts=[types.Part(text=full_system_prompt)]
            ),
        )
        
        try:
            # Create the async context manager
            self.session_context = self.client.aio.live.connect(
                model=self.MODEL,
                config=config
            )
            
            # Enter the context manager manually
            self.session = await self.session_context.__aenter__()
            self.is_connected = True
            print(f"✅ Connected to Gemini Live API (video={self.enable_video})")
            
            # Start the receive loop
            self._receive_task = asyncio.create_task(self._receive_loop())
            
        except Exception as e:
            print(f"❌ Failed to connect to Gemini Live API: {e}")
            raise
    
    async def _receive_loop(self):
        """Continuously receive and process responses from Gemini."""
        try:
            while self.is_connected and self.session:
                turn = self.session.receive()
                async for response in turn:
                    await self._handle_response(response)
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"❌ Error in receive loop: {e}")
    
    async def _handle_response(self, response):
        """Process a response from Gemini Live API."""
        try:
            if response.server_content:
                # Handle interruption
                if response.server_content.interrupted:
                    print("🔄 Response interrupted by user")
                    self.is_model_speaking = False
                    return
                
                # Check if turn is complete
                if response.server_content.turn_complete:
                    print("✅ Model turn complete")
                    self.is_model_speaking = False
                    return
                
                # Handle model turn (audio/text output)
                if response.server_content.model_turn:
                    self.is_model_speaking = True
                    for part in response.server_content.model_turn.parts:
                        # Audio data
                        if part.inline_data and part.inline_data.data:
                            audio_bytes = part.inline_data.data
                            if isinstance(audio_bytes, bytes):
                                print(f"📢 Received audio: {len(audio_bytes)} bytes")
                                if self.on_audio_callback:
                                    await self._call_callback(self.on_audio_callback, audio_bytes)
                        
                        # Text data (transcription)
                        if hasattr(part, 'text') and part.text:
                            print(f"📝 AI text: {part.text[:100]}...")
                            if self.on_text_callback:
                                await self._call_callback(self.on_text_callback, part.text)
        except Exception as e:
            print(f"❌ Error handling response: {e}")
            import traceback
            traceback.print_exc()
    
    async def _call_callback(self, callback: Callable, data: Any):
        """Safely call a callback, handling both sync and async functions."""
        if asyncio.iscoroutinefunction(callback):
            await callback(data)
        else:
            callback(data)
    
    async def send_audio(self, audio_data: bytes, sample_rate: int = 16000):
        """
        Send audio data to Gemini for processing.
        
        Args:
            audio_data: Raw PCM audio bytes (16-bit, mono)
            sample_rate: Sample rate (default 16000 Hz)
        """
        if not self.is_connected or not self.session:
            return
        
        # Don't send audio while model is speaking to avoid interruption
        if self.is_model_speaking:
            return
        
        try:
            await self.session.send_realtime_input(
                audio=types.Blob(
                    data=audio_data,
                    mime_type=f"audio/pcm;rate={sample_rate}"
                )
            )
        except Exception as e:
            print(f"❌ Error sending audio: {e}")
    
    async def send_audio_base64(self, audio_b64: str, sample_rate: int = 16000):
        """
        Send base64-encoded audio data.
        
        Args:
            audio_b64: Base64-encoded PCM audio
            sample_rate: Sample rate (default 16000 Hz)
        """
        audio_bytes = base64.b64decode(audio_b64)
        await self.send_audio(audio_bytes, sample_rate)
    
    async def send_video_frame(self, frame_data: bytes, mime_type: str = "image/jpeg"):
        """
        Send a video frame for visual analysis.
        
        Args:
            frame_data: Image bytes (JPEG or PNG)
            mime_type: MIME type of the image
        """
        if not self.is_connected or not self.session or not self.enable_video:
            return
        
        try:
            await self.session.send_realtime_input(
                video=types.Blob(
                    data=frame_data,
                    mime_type=mime_type
                )
            )
        except Exception as e:
            print(f"❌ Error sending video frame: {e}")
    
    async def send_video_frame_base64(self, frame_b64: str, mime_type: str = "image/jpeg"):
        """
        Send a base64-encoded video frame.
        
        Args:
            frame_b64: Base64-encoded image
            mime_type: MIME type of the image
        """
        frame_bytes = base64.b64decode(frame_b64)
        await self.send_video_frame(frame_bytes, mime_type)
    
    async def send_text(self, text: str):
        """
        Send text input to the model.
        
        Args:
            text: Text message to send
        """
        if not self.is_connected or not self.session:
            return
        
        try:
            await self.session.send_client_content(
                turns=[{"role": "user", "parts": [{"text": text}]}],
                turn_complete=True
            )
        except Exception as e:
            print(f"❌ Error sending text: {e}")
    
    async def disconnect(self):
        """Disconnect from the Gemini Live API."""
        self.is_connected = False
        
        if self._receive_task:
            self._receive_task.cancel()
            try:
                await self._receive_task
            except asyncio.CancelledError:
                pass
        
        if self.session_context:
            try:
                await self.session_context.__aexit__(None, None, None)
            except Exception:
                pass
            self.session_context = None
            self.session = None
        
        print("✅ Disconnected from Gemini Live API")
