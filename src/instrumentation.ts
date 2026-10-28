// How often the server stores results of ended assignment periods and releases those customers, checks ERP for new orders from
// assigned customers and whether the weekly Zalo report is due.
const BACKGROUND_JOB_INTERVAL_MS = 5 * 60 * 1000;

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // Dev reloads can call register() again; one timer per process is enough.
  const state = globalThis as unknown as { backgroundJobsStarted?: boolean };
  if (state.backgroundJobsStarted) return;
  state.backgroundJobsStarted = true;

  const { closeEndedAssignmentsSafely } = await import('@/lib/assignment-history');
  const { runZaloJobs } = await import('@/lib/zalo-progress');
  const zaloEnabled = process.env.ZALO_NOTIFY_ENABLED !== 'false';

  const tick = async () => {
    await closeEndedAssignmentsSafely();
    if (zaloEnabled) await runZaloJobs();
  };

  setTimeout(() => void tick(), 60_000).unref();
  setInterval(() => void tick(), BACKGROUND_JOB_INTERVAL_MS).unref();
}
