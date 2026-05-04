import time
import subprocess
import os
from datetime import datetime
import pytz

def is_market_open():
    # IST (UTC+5:30)
    tz = pytz.timezone('Asia/Kolkata')
    now = datetime.now(tz)
    
    # Monday = 0, Friday = 4
    if now.weekday() > 4:
        return False
        
    # 9:15 AM to 3:30 PM
    market_start = now.replace(hour=9, minute=15, second=0, microsecond=0)
    market_end = now.replace(hour=15, minute=30, second=0, microsecond=0)
    
    return market_start <= now <= market_end

def run_pipeline():
    print(f"[{datetime.now()}] Starting SteadyAlpha Watchdog Run...")
    try:
        # Run the main pipeline
        result = subprocess.run(["python", "pipeline/main.py"], capture_output=True, text=True)
        if result.returncode == 0:
            print(f"[{datetime.now()}] Run Successful.")
        else:
            print(f"[{datetime.now()}] Run Failed: {result.stderr}")
    except Exception as e:
        print(f"[{datetime.now()}] Error executing pipeline: {e}")

if __name__ == "__main__":
    print("SteadyAlpha Watchdog initialized. Monitoring market hours (9:15-15:30 IST).")
    
    # First run immediately
    run_pipeline()
    
    while True:
        if is_market_open():
            run_pipeline()
            # Wait for 1 hour
            print("Next run in 60 minutes...")
            time.sleep(3600)
        else:
            print(f"[{datetime.now()}] Market closed. Sleeping for 15 minutes...")
            time.sleep(900)
