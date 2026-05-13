/**
 * Jarvis Scheduled Jobs management
 * Registers / updates the morning briefing and weekly review heartbeat crons
 */
import { TRPCError } from "@trpc/server";
import { createHeartbeatJob, listHeartbeatJobs, updateHeartbeatJob } from "./_core/heartbeat";

const MORNING_BRIEFING_JOB_NAME = "jarvis-morning-briefing";
const WEEKLY_REVIEW_JOB_NAME = "jarvis-weekly-review";

type HeartbeatJob = { name: string; taskUid: string; isEnable: boolean };

async function getJobList(userSession: string): Promise<HeartbeatJob[]> {
  try {
    const existing = await listHeartbeatJobs(userSession);
    return Array.isArray(existing?.jobs) ? (existing.jobs as HeartbeatJob[]) : [];
  } catch {
    return [];
  }
}

async function ensureJob(
  name: string,
  cron: string,
  path: string,
  description: string,
  userSession: string,
): Promise<void> {
  try {
    const jobs = await getJobList(userSession);
    const found = jobs.find(j => j.name === name);

    if (found) {
      if (!found.isEnable) {
        await updateHeartbeatJob(found.taskUid, { enable: true }, userSession);
        console.log(`[Jarvis] Cron re-enabled: ${name}`);
      } else {
        console.log(`[Jarvis] Cron already active: ${name}`);
      }
      return;
    }

    await createHeartbeatJob({ name, cron, path, method: "POST", description }, userSession);
    console.log(`[Jarvis] Cron registered: ${name}`);
  } catch (err) {
    const isTrpc = err instanceof TRPCError;
    if (isTrpc && err.code === "CONFLICT") {
      console.log(`[Jarvis] Cron already exists (conflict): ${name}`);
      return;
    }
    console.warn(`[Jarvis] Could not register cron ${name}:`, err instanceof Error ? err.message : err);
  }
}

/**
 * Ensure the morning briefing cron is registered.
 * Cron: 0 0 7 * * * = daily at 07:00 UTC (= 09:00 CEST)
 */
export async function ensureMorningBriefingJob(userSession: string): Promise<void> {
  await ensureJob(
    MORNING_BRIEFING_JOB_NAME,
    "0 0 7 * * *",
    "/api/scheduled/morning-briefing",
    "Daily Jarvis morning briefing for Florian at 09:00 CEST",
    userSession,
  );
}

/**
 * Ensure the weekly review cron is registered.
 * Cron: 0 0 8 * * 5 = every Friday at 08:00 UTC (= 10:00 CEST)
 */
export async function ensureWeeklyReviewJob(userSession: string): Promise<void> {
  await ensureJob(
    WEEKLY_REVIEW_JOB_NAME,
    "0 0 8 * * 5",
    "/api/scheduled/weekly-review",
    "Weekly Jarvis performance review for Florian every Friday at 10:00 CEST",
    userSession,
  );
}

/**
 * Register all Jarvis scheduled jobs.
 * Idempotent — safe to call on every server start.
 */
export async function ensureAllJarvisJobs(userSession: string): Promise<void> {
  await Promise.allSettled([
    ensureMorningBriefingJob(userSession),
    ensureWeeklyReviewJob(userSession),
  ]);
}
