
import asyncio
import logging
from typing import Optional, Dict, Any
from playwright.async_api import async_playwright
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

R360_URL = "https://www.research360.in/future-and-options/option-chain"

async def get_r360_data_dom(symbol: str = "NIFTY") -> Optional[Dict[str, Any]]:
    """
    Scrape Research360 Option Chain page using Playwright.
    Returns { "pcr": float, "option_chain": dict } or None
    """
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        # Use a realistic user agent
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
        )
        page = await context.new_page()
        
        try:
            logger.info(f"[r360_scraper] Navigating to {R360_URL}...")
            # Use domcontentloaded instead of networkidle to avoid timeout from trackers
            await page.goto(R360_URL, timeout=60000, wait_until="domcontentloaded")
            
            title = await page.title()
            logger.info(f"[r360_scraper] Page Title: {title}")
            
            # Try to wait for the main table to appear
            try:
                await page.wait_for_selector("#optionChainTable table tbody tr", timeout=20000)
                logger.info("[r360_scraper] Table found.")
            except:
                logger.warning("[r360_scraper] Table not found within timeout, trying fallback wait...")
                await page.wait_for_selector('div:has-text("Put Call Ratio")', timeout=10000)
            
            # Extra buffer for JS rendering
            await asyncio.sleep(8)
            
            # 1. Extract PCR
            pcr_val = None
            try:
                # Confirmed selector: div:has-text("Put Call Ratio") b
                # Wait for the text to be a number (not "--" or "Loading")
                pcr_el = await page.query_selector('div:has-text("Put Call Ratio") b')
                if pcr_el:
                    text = (await pcr_el.inner_text()).strip()
                    logger.info(f"[r360_scraper] PCR Raw Text: '{text}'")
                    if text and text.replace(".", "").isdigit():
                        pcr_val = float(text)
                        logger.info(f"[r360_scraper] Found direct PCR: {pcr_val}")
                
                if not pcr_val:
                    # Fallback: look for any b that contains a decimal-like string near the text
                    b_tags = await page.query_selector_all("b")
                    for b in b_tags:
                        text = (await b.inner_text()).strip()
                        if text and text.replace(".", "").isdigit() and "." in text:
                            # Check if parent has "Put Call Ratio"
                            parent = await b.evaluate_handle("el => el.parentElement.innerText")
                            if "Put Call Ratio" in str(parent):
                                pcr_val = float(text)
                                logger.info(f"[r360_scraper] Found PCR via parent search: {pcr_val}")
                                break
            except Exception as e:
                logger.debug(f"[r360_scraper] Direct PCR extraction failed: {e}")
            
            # 2. Extract Option Chain
            rows_data = []
            rows = await page.query_selector_all("#optionChainTable table tbody tr")
            logger.info(f"[r360_scraper] Found {len(rows)} potential rows.")
            
            total_call_oi = 0
            total_put_oi = 0
            
            # Try to identify OI columns from headers
            headers = await page.query_selector_all("#optionChainTable table thead th")
            header_texts = [ (await h.inner_text()).upper().strip() for h in headers ]
            logger.info(f"[r360_scraper] Table Headers: {header_texts}")
            
            call_oi_idx = -1
            put_oi_idx = -1
            
            import re
            def clean_num(s):
                if not s: return 0.0
                # Take the first word (usually the value) before parentheticals or extra lines
                parts = s.replace("\n", " ").split()
                if not parts: return 0.0
                first_part = parts[0]
                # Remove everything except digits and decimal point
                cleaned = re.sub(r'[^\d.]', '', first_part)
                try:
                    return float(cleaned) if cleaned else 0.0
                except:
                    return 0.0

            # Find OI columns
            for idx, h in enumerate(header_texts):
                if 'OI' == h or 'OPEN INT' in h or 'OPEN INTEREST' == h:
                    if call_oi_idx == -1: call_oi_idx = idx
                    else: put_oi_idx = idx

            # Fallback indices if not found by name
            if call_oi_idx == -1: call_oi_idx = 0 
            if put_oi_idx == -1: put_oi_idx = len(header_texts) - 1 if len(header_texts) > 0 else 10

            logger.info(f"[r360_scraper] Using OI indices: Call={call_oi_idx}, Put={put_oi_idx}")

            for i, row in enumerate(rows): 
                cells = await row.query_selector_all("td")
                row_vals = [ (await c.inner_text()).strip() for c in cells ]
                if len(row_vals) >= 5:
                    rows_data.append(row_vals)
                    c_oi_raw = row_vals[call_oi_idx] if call_oi_idx < len(row_vals) else "0"
                    p_oi_raw = row_vals[put_oi_idx] if put_oi_idx < len(row_vals) else "0"
                    
                    c_oi = clean_num(c_oi_raw)
                    p_oi = clean_num(p_oi_raw)
                    
                    if i < 3:
                        logger.info(f"[r360_scraper] Row {i} OI: Call='{c_oi_raw}'->{c_oi}, Put='{p_oi_raw}'->{p_oi}")
                        
                    total_call_oi += c_oi
                    total_put_oi += p_oi
            
            if not pcr_val and total_call_oi > 0:
                pcr_val = total_put_oi / total_call_oi
                logger.info(f"[r360_scraper] Calculated fallback PCR: {pcr_val:.4f} (Total Call OI: {total_call_oi}, Total Put OI: {total_put_oi})")
            else:
                logger.warning(f"[r360_scraper] Fallback PCR calculation skipped. total_call_oi={total_call_oi}")

            if pcr_val is None and not rows_data:
                logger.warning("[r360_scraper] No data extracted (PCR or rows)")
                return None
                
            return {
                "pcr": pcr_val,
                "option_chain": {
                    "symbol": symbol,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "rows": rows_data
                }
            }

        except Exception as e:
            logger.error(f"[r360_scraper] DOM scraping failed: {e}")
            return None
        finally:
            await browser.close()

def get_r360_pcr_dom(symbol: str = "NIFTY") -> Optional[float]:
    """Sync wrapper for PCR only."""
    res = asyncio.run(get_r360_data_dom(symbol))
    return res.get("pcr") if res else None

def get_r360_chain_dom(symbol: str = "NIFTY") -> Optional[Dict[str, Any]]:
    """Sync wrapper for Option Chain only."""
    res = asyncio.run(get_r360_data_dom(symbol))
    return res.get("option_chain") if res else None
