import asyncio
import os
from datetime import datetime, timedelta
# Import from database
import sys
sys.path.append('.')
from database import generate_session_summary, save_session_log
from dotenv import load_dotenv

load_dotenv()

# Simulate a transcript where only Dr. Aegis speaks (confirming patient input)
TRANSCRIPT = """
Dr. Aegis: Hello! I see you're checking in.
Dr. Aegis: I've noted that your heart rate is 110 bpm, which is a bit high.
Dr. Aegis: You also mentioned you took your Metoprolol this morning, I've logged that.
Dr. Aegis: Your SpO2 of 98% looks good though.
"""

async def test():
    print("Testing extraction from AI CONFIRMATIONS...")
    summary, insights, vitals, meds = await generate_session_summary(TRANSCRIPT)
    
    print(f"Summary: {summary}")
    print(f"Vitals: {vitals}")
    print(f"Meds: {meds}")
    
    if vitals.get('heart_rate') == 110:
        print("✅ SUCCESS: Correctly extracted 110 BPM from AI confirmation.")
    else:
        print(f"❌ FAILURE: Extracted heart_rate: {vitals.get('heart_rate')}")

if __name__ == "__main__":
    asyncio.run(test())
