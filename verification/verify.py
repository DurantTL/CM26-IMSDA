from playwright.sync_api import sync_playwright

def verify_apps():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 375, 'height': 812}) # Mobile viewport

        # Verify Cafe Scanner
        page = context.new_page()
        page.goto("http://localhost:3000/cafe/")
        page.wait_for_load_state("networkidle")
        page.screenshot(path="verification/cafe_scanner.png")
        print("Captured Cafe Scanner screenshot")

        # Verify Check-In System
        page = context.new_page()
        page.goto("http://localhost:3000/checkin/")
        page.wait_for_load_state("networkidle")
        page.screenshot(path="verification/checkin_system.png")
        print("Captured Check-In System screenshot")

        browser.close()

if __name__ == "__main__":
    verify_apps()
