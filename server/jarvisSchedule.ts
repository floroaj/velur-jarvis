/**
 * Jarvis Scheduled Jobs management
 * Registers / updates the morning briefing heartbeat cron
 */
import { TRPCError } from "@trpc/server";
import { createHeartbeatJob, listHeartbeatJobs, updateHeartbeatJob } from "./_core/heartbeat";
import { ENV } from "./_core/env";

const MORNING_BRIEFING_JOB_NAME = "jarvis-morning-briefing";

/**
 * Ensure the morning briefing cron is registered.
 * Idempotent — safe to call on every server start.
 * Cron: 0 0 7 * * * = daily at 07:00 UTC (= 09:00 CEST)
 */
export async function ensureMorningBriefingJob(userSession: string): Promise<void> {
  try {
    let found: { name: string; taskUid: string; isEnable: boolean } | undefined;
    try {
      const existing = await listHeartbeatJobs(userSession);
      const jobList: Array<{ name: string; taskUid: string; isEnable: boolean }> = Array.isArray(existing?.jobs)
        ? existing.jobs
        : [];
      found = jobList.find(j => j.name === MORNING_BRIEFING_JOB_NAME);
    } catch (listErr) {
      // If listing fails (e.g. first run, auth issue), try to create directly
      console.warn("[Jarvis] Could not list heartbeat jobs, attempting create:", listErr instanceof Error ? listErr.message : listErr);
    }

    if (found) {
      if (!found.isEnable) {
        await updateHeartbeatJob(found.taskUid, { enable: true }, userSession);
        console.log("[Jarvis] Morning briefing cron re-enabled");
      } else {
        console.log("[Jarvis] Morning briefing cron already active");
      }
      return;
    }

    await createHeartbeatJob(
      {
        name: MORNING_BRIEFING_JOB_NAME,
        cron: "0 0 7 * * *",
        path: "/api/scheduled/morning-briefing",
        method: "POST",
        description: "Daily Jarvis morning briefing for Florian at 09:00 CEST",
      },
      userSession,
    );
    console.log("[Jarvis] Morning briefing cron registered");
  } catch (err) {
    // Non-fatal — CONFLICT means job already exists, which is fine
    const isTrpc = err instanceof TRPCError;
    if (isTrpc && err.code === "CONFLICT") {
      console.log("[Jarvis] Morning briefing cron already exists (conflict)");
      return;
    }
    console.warn("[Jarvis] Could not register morning briefing cron:", err instanceof Error ? err.message : err);
  }
}
