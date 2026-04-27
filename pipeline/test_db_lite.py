import os
import uuid
import json
import httpx
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

def test_connectivity():
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    
    if not url or not key:
        print("Error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not found.")
        return

    base_url = f"{url}/rest/v1"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }
    
    print(f"Connecting to: {url}")

    try:
        run_id = str(uuid.uuid4())
        
        # Test 1: Insert Run
        print(f"Testing 'runs' table with ID: {run_id}")
        data = {
            'id': run_id,
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'status': 'validation_test',
            'duration_ms': 0
        }
        with httpx.Client() as client:
            resp = client.post(f"{base_url}/runs", headers=headers, json=data)
            resp.raise_for_status()
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
        with httpx.Client() as client:
            resp = client.post(f"{base_url}/signals_summary", headers=headers, json=summary)
            resp.raise_for_status()
        print("✓ 'signals_summary' table insert successful.")
        
        print("\nSUCCESS: All critical tables are accepting data.")
        
    except Exception as e:
        print(f"\nFAILED: {e}")
        if hasattr(e, 'response'):
            print(f"Response: {e.response.text}")

if __name__ == "__main__":
    test_connectivity()
