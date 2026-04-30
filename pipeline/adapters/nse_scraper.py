"""
pipeline/adapters/nse_scraper.py
DOM-based scraper for NSE Option Chain (PCR/OI).
Uses playwright to bypass stealth session failures.
"""
import logging
import time
from typing import Optional

logger = logging.getLogger(__name__)

def get_nse_pcr_dom(symbol: str = "NIFTY") -> Optional[float]:
    """Navigate to NSE option chain and extract PCR via DOM."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        logger.error("[nse_scraper] playwright not installed")
        return None

    try:
        with sync_playwright() as p:
            logger.info("[nse_scraper] Launching browser...")
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
            page = context.new_page()
            
            # Step 1: Initialize cookies by visiting homepage
            logger.info("[nse_scraper] Warming cookies on nseindia.com...")
            page.goto("https://www.nseindia.com", wait_until="domcontentloaded", timeout=30000)
            time.sleep(2)
            
            # Step 2: Navigate to option chain
            url = f"https://www.nseindia.com/option-chain?symbol={symbol}"
            logger.info(f"[nse_scraper] Navigating to {url}...")
            page.goto(url, wait_until="networkidle", timeout=30000)
            
            # Step 3: Wait for the table and extract totals
            # The total row is usually in the tfoot or the last row of tbody
            page.wait_for_selector("#octable", timeout=15000)
            
            # CE Total OI is in the 2nd column of the footer
            # PE Total OI is in the last column of the footer
            # Using a more robust locator based on the structure observed in production
            try:
                ce_total_cell = page.locator("#octable tfoot tr td").nth(1)
                pe_total_cell = page.locator("#octable tfoot tr td").last
                
                ce_oi_text = ce_total_cell.inner_text().strip()
                pe_oi_text = pe_total_cell.inner_text().strip()
                
                logger.debug(f"[nse_scraper] Raw DOM texts: CE={ce_oi_text}, PE={pe_oi_text}")
                
                # Strip commas and handle empty/hyphen
                def clean(txt):
                    txt = txt.replace(",", "").replace("-", "").strip()
                    return float(txt) if txt else 0.0

                ce_oi = clean(ce_oi_text)
                pe_oi = clean(pe_oi_text)
                
                if ce_oi > 0:
                    pcr = pe_oi / ce_oi
                    logger.info(f"[nse_scraper] DOM Scraped PCR: {pcr:.2f} (Total CE OI: {ce_oi}, Total PE OI: {pe_oi})")
                    browser.close()
                    return round(pcr, 2)
                
                logger.warning("[nse_scraper] CE OI is 0, cannot calculate PCR")
                
            except Exception as e:
                logger.warning(f"[nse_scraper] Failed to find totals in footer, trying fallback row: {e}")
                # Fallback: check the very last row of the table if tfoot fails
                last_row_cells = page.locator("#octable tr").last.locator("td")
                ce_oi = clean(last_row_cells.nth(1).inner_text())
                pe_oi = clean(last_row_cells.last.inner_text())
                if ce_oi > 0:
                    pcr = pe_oi / ce_oi
                    browser.close()
                    return round(pcr, 2)

            browser.close()
            return None
    except Exception as exc:
        logger.error(f"[nse_scraper] DOM scraping exception: {exc}")
        return None
