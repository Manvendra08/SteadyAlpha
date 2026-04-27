"""
SteadyAlpha Notifier
Sends alerts to Telegram/WhatsApp.
"""

import os
import requests
from typing import Dict, Any

class Notifier:
    def __init__(self):
        self.tg_bot_token = os.getenv('TELEGRAM_BOT_TOKEN')
        self.tg_chat_id = os.getenv('TELEGRAM_CHAT_ID')

    def send_telegram(self, message: str) -> bool:
        if not self.tg_bot_token or not self.tg_chat_id:
            return False
            
        url = f"https://api.telegram.org/bot{self.tg_bot_token}/sendMessage"
        payload = {
            "chat_id": self.tg_chat_id,
            "text": message,
            "parse_mode": "Markdown"
        }
        
        try:
            resp = requests.post(url, json=payload, timeout=5)
            return resp.status_code == 200
        except Exception as e:
            print(f"Telegram send fail: {e}")
            return False

    def alert_run_results(self, results: Dict[str, Any]):
        """Format and send advisor & order updates."""
        advisor = results.get('advisor', {})
        orders = results.get('paper_orders', [])
        
        action = advisor.get('action', 'UNKNOWN')
        score = advisor.get('score', 0)
        
        if action == 'NEUTRAL' and not orders:
            return # Skip noise
            
        msg = f"🟢 *SteadyAlpha Alert*\n"
        msg += f"Advisor: *{action}* (Score: {score})\n\n"
        
        if orders:
            msg += "📝 *Paper Orders:*\n"
            for o in orders:
                msg += f"- {o['symbol']} {o['direction']} ({o['status']})\n"
                
        self.send_telegram(msg)
