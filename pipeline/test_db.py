import os
import uuid
from datetime import datetime, timezone
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

def test_connectivity():
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    
    print(f"Connecting to: {url}")
    if not key:
        print("Error: SUPABASE_SERVICE_ROLE_KEY not found.")
        return

    try:
        supabase: Client = create_client(url, key)
        run_id = str(uuid.uuid4())
        
        # Test 1: Insert Run
        print(f"Testing 'runs' table with ID: {run_id}")
        data = {
            'id': run_id,
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'status': 'validation_test',
            'duration_ms': 0
        }
        supabase.table('runs').insert(data).execute()
        print("✓ 'runs' table insert successful.")
        
        # Test 2: Insert Signal Summary
        print("Testing 'signals_summary' table...")
        summary = {
            'run_id': run_id,
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'regime': {'state': 'validation_test'},
            'flows': {},
            'leadership': {},
            'risk': {},
            'advisor': {}
        }
        supabase.table('signals_summary').insert(summary).execute()
        print("✓ 'signals_summary' table insert successful.")
        
        print("\nSUCCESS: All critical tables are accepting data.")
        
    except Exception as e:
        print(f"\nFAILED: {e}")
        print("\nPossible issues:")
        print("1. SQL Migration not applied (tables missing).")
        print("2. Service Role Key lacks permissions.")
        print("3. Table names in code don't match database (e.g., 'runs' vs 'run_registry').")

if __name__ == "__main__":
    test_connectivity()
