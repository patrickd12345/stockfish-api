
from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # 1. Verify Account Page
    page.goto("http://localhost:3000/account")
    # Wait for the heading to appear
    page.wait_for_selector('h1:has-text("Account Settings")')
    # Take screenshot of Account page
    page.screenshot(path="verification/account_page.png")

    # 2. Verify Pricing Page
    page.goto("http://localhost:3000/pricing")
    # Wait for the heading
    page.wait_for_selector('h1:has-text("Simple Pricing")')
    # Take screenshot of Pricing page
    page.screenshot(path="verification/pricing_page.png")

    # 3. Verify BYOK Input works (fill and save)
    page.goto("http://localhost:3000/account")
    page.fill('input[type="password"]', 'sk-fake-key-for-testing')
    page.click('button:has-text("Save Key")')
    # Wait for "Saved!" to verify state change
    page.wait_for_selector('button:has-text("Saved!")')
    page.screenshot(path="verification/account_saved.png")

    # 4. Verify Local Storage has the key
    key = page.evaluate("localStorage.getItem('openai_api_key')")
    print(f"Stored Key: {key}")
    if key != 'sk-fake-key-for-testing':
        raise Exception("Key was not saved to localStorage")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
