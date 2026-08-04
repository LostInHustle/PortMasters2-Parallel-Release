// =====================================================================
// Playwright wiring for the E2E scenario suite: one shared Chromium
// instance for the whole run, with a helper that hands a scenario an
// authenticated tab for a given TestClient without repeating the
// cookie-injection boilerplate at every call site.
// =====================================================================
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";
import { SESSION_COOKIE_NAME } from "../../../src/lib/auth";
import type { TestClient } from "./api";

let browser: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (!browser) browser = await chromium.launch();
  return browser;
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

// Every captain who hasn't seen the "Welcome aboard" tutorial before (i.e.
// every fresh browser context, since it's gated on a localStorage flag;
// see TUTORIAL_SEEN_KEY in GameRoom.tsx) gets it auto-opened ~600ms after
// mount. It's a Radix Dialog, which applies aria-hidden to the rest of the
// page while open, so every getByRole query against the game underneath
// (Start the Voyage, Lock In Boon, Hire Weaver, ...) resolves to nothing
// until it's dismissed, not because those elements are gone but because
// they're outside the accessible tree while the dialog sits on top of
// them. A scenario that doesn't account for this doesn't fail loudly with
// "there's a dialog in the way"; it just times out waiting on an element
// that a screenshot shows is right there. Dismissed here, once, so every
// scenario using openAuthedPage gets a clean slate without repeating this.
async function dismissTutorialIfPresent(page: Page): Promise<void> {
  const skip = page.getByRole("button", { name: "Skip tutorial" });
  try {
    await skip.waitFor({ state: "visible", timeout: 2500 });
    await skip.click();
  } catch {
    // Never appeared in time, so there is nothing to dismiss.
  }
}

// A fresh context + page authenticated as `client`, pointed at the app's
// root. Each scenario gets its own context (not just a new page) so
// captains never share localStorage/sessionStorage by accident the way
// tabs in the same context would.
export async function openAuthedPage(
  baseUrl: string,
  client: TestClient,
): Promise<{ context: BrowserContext; page: Page }> {
  const url = new URL(baseUrl);
  const context = await (await getBrowser()).newContext();
  await context.addCookies([
    {
      name: SESSION_COOKIE_NAME,
      value: client.sessionToken,
      domain: url.hostname,
      path: "/",
      httpOnly: true,
      secure: false,
    },
  ]);
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await dismissTutorialIfPresent(page);
  return { context, page };
}
