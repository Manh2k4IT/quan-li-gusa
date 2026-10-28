// How often the server checks ERP for new orders from assigned customers and whether the weekly Zalo report is due.
const ZALO_JOB_INTERVAL_MS = 5 * 60 * 1000;

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.ZALO_NOTIFY_ENABLED === 'false') return;

  // Dev reloads can call register() again; one timer per process is enough.
  const state = globalThis as unknown as { zaloJobsStarted?: boolean };
  if (state.zaloJobsStarted) return;
  state.zaloJobsStarted = true;

  const { runZaloJobs } = await import('@/lib/zalo-progress');
  setTimeout(() => void runZaloJobs(), 60_000).unref();
  setInterval(() => void runZaloJobs(), ZALO_JOB_INTERVAL_MS).unref();
}
