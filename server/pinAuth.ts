/**
 * PIN-based authentication for Jarvis.
 *
 * POST /api/pin-login  { pin: string }
 *   → verifies PIN against JARVIS_PIN env var
 *   → upserts the owner user in DB (same as OAuth flow)
 *   → sets the same app_session_id JWT cookie
 *
 * POST /api/pin-logout
 *   → clears the session cookie
 */
import type { Express } from "express";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";
import { getUserByOpenId, getUserByRole, upsertUser } from "./db";

/** The synthetic openId used for PIN-authenticated sessions */
const PIN_OWNER_OPEN_ID = "pin_owner";

export function registerPinAuthRoutes(app: Express) {
  // POST /api/pin-login
  app.post("/api/pin-login", async (req, res) => {
    try {
      const { pin } = req.body as { pin?: string };

      if (!pin) {
        res.status(400).json({ error: "PIN required" });
        return;
      }

      const expectedPin = ENV.jarvisPin;
      if (!expectedPin) {
        res.status(500).json({ error: "JARVIS_PIN not configured" });
        return;
      }

      if (pin !== expectedPin) {
        res.status(401).json({ error: "Invalid PIN" });
        return;
      }

      // Resolve the owner user — prefer OWNER_OPEN_ID env, fall back to first admin in DB
      let ownerOpenId = ENV.ownerOpenId || PIN_OWNER_OPEN_ID;

      // Ensure owner exists in DB
      let user = ownerOpenId !== PIN_OWNER_OPEN_ID
        ? await getUserByOpenId(ownerOpenId)
        : await getUserByRole("admin");

      if (!user) {
        // Create a synthetic owner entry so the rest of the app works
        await upsertUser({
          openId: PIN_OWNER_OPEN_ID,
          name: "Florian",
          email: "floriandkk@gmail.com",
          loginMethod: "pin",
          lastSignedIn: new Date(),
        });
        // Promote to admin
        const { getDb } = await import("./db");
        const db = await getDb();
        if (db) {
          const { users } = await import("../drizzle/schema");
          const { eq } = await import("drizzle-orm");
          await db.update(users).set({ role: "admin" }).where(eq(users.openId, PIN_OWNER_OPEN_ID));
        }
        user = await getUserByOpenId(PIN_OWNER_OPEN_ID);
        ownerOpenId = PIN_OWNER_OPEN_ID;
      }

      if (!user) {
        res.status(500).json({ error: "Failed to resolve owner user" });
        return;
      }

      // Issue JWT session cookie — identical format to OAuth flow
      const sessionToken = await sdk.createSessionToken(user.openId, {
        expiresInMs: ONE_YEAR_MS,
        name: user.name ?? "Florian",
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.json({ ok: true, name: user.name });
    } catch (err) {
      console.error("[PIN Auth] Login error:", err);
      res.status(500).json({ error: "Internal error" });
    }
  });

  // POST /api/pin-logout
  app.post("/api/pin-logout", (req, res) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    res.json({ ok: true });
  });
}
