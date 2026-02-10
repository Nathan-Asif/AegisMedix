
import asyncio
import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Missing Supabase credentials")
    exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

async def test_update():
    patient_id = "ac3b4c71-b23e-441d-b717-b57e53e49ffd" # Nathan Asif
    print(f"Testing update for patient: {patient_id}")
    
    # Check current data
    try:
        res = supabase.table("patients").select("*").eq("id", patient_id).execute()
        print(f"Current Data: {res.data[0] if res.data else 'Not Found'}")
        if res.data:
            print(f"Keys: {res.data[0].keys()}")
            if 'date_of_birth' not in res.data[0]:
                print("❌ CRITICAL: 'date_of_birth' column MISSING in select response!")
            else:
                print(f"Current DOB: {res.data[0]['date_of_birth']}")
    except Exception as e:
        print(f"Error selecting: {e}")

    # Try update
    try:
        update_data = {"date_of_birth": "2004-07-02"}
        print(f"Attempting update: {update_data}")
        res = supabase.table("patients").update(update_data).eq("id", patient_id).execute()
        print(f"Update Result: {res}")
        if res.data and res.data[0].get('date_of_birth') == '2004-07-02':
            print("✅ Update SUCCESSFUL!")
        else:
            print("❌ Update FAILED to persist!")
            
    except Exception as e:
        print(f"❌ Error updating: {e}")

if __name__ == "__main__":
    asyncio.run(test_update())
