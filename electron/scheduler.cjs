// electron/scheduler.cjs
// Main-process EPG scheduled-recording engine. Persists jobs, arms timers,
// reconciles on launch, and drives the existing RecordingManager.
const STORE_KEY = 'iptv.schedules.v1';

// Decide what to do with a loaded job at time `now`.
function reconcileJob(job, now) {
  if (job.status === 'completed' || job.status === 'canceled' || job.status === 'missed') return 'done';
  if (now >= job.stopMs) return 'missed';
  if (job.startMs <= now && now < job.stopMs) return 'start-now';
  return 'arm';
}

function createScheduler({ store, recordingManager, onUpdate }) {
  const timers = new Map(); // id -> { startT, stopT }

  function loadJobs() {
    try { return store.get(STORE_KEY) || []; } catch (e) { return []; }
  }
  function saveJobs(jobs) {
    try { store.set(STORE_KEY, jobs); } catch (e) { /* in-memory only */ }
    if (onUpdate) onUpdate(jobs);
  }
  function getJob(jobs, id) { return jobs.find((j) => j.id === id); }

  function setStatus(id, status) {
    const jobs = loadJobs();
    const job = getJob(jobs, id);
    if (!job) return;
    job.status = status;
    saveJobs(jobs);
  }

  function clearTimers(id) {
    const t = timers.get(id);
    if (t) { clearTimeout(t.startT); clearTimeout(t.stopT); timers.delete(id); }
  }

  async function fireStart(job) {
    try {
      await recordingManager.startRecording(job.id, job.url, job.title || job.channelName || 'recording');
      setStatus(job.id, 'recording');
    } catch (e) {
      setStatus(job.id, 'missed');
    }
  }
  async function fireStop(job) {
    try { await recordingManager.stopRecording(job.id); } catch (e) { /* ignore */ }
    setStatus(job.id, 'completed');
    clearTimers(job.id);
  }

  function arm(job) {
    const now = Date.now();
    const startT = setTimeout(() => fireStart(job), Math.max(0, job.startMs - now));
    const stopT = setTimeout(() => fireStop(job), Math.max(0, job.stopMs - now));
    timers.set(job.id, { startT, stopT });
  }

  function armOrRun(job) {
    const decision = reconcileJob(job, Date.now());
    if (decision === 'arm') {
      arm(job);
    } else if (decision === 'start-now') {
      fireStart(job);
      const stopT = setTimeout(() => fireStop(job), Math.max(0, job.stopMs - Date.now()));
      timers.set(job.id, { startT: null, stopT });
    } else if (decision === 'missed') {
      job.status = 'missed';
    }
  }

  return {
    init() {
      const jobs = loadJobs();
      for (const job of jobs) armOrRun(job);
      saveJobs(jobs); // persists any missed transitions + notifies renderer
    },
    add(job) {
      if (!job || !job.url || !(job.stopMs > job.startMs)) {
        return { success: false, error: 'Invalid schedule (need url and stop > start)' };
      }
      if (Date.now() >= job.stopMs) {
        return { success: false, error: 'That program has already ended' };
      }
      const jobs = loadJobs();
      const record = { ...job, status: 'scheduled' };
      jobs.push(record);
      saveJobs(jobs);
      armOrRun(record);
      // armOrRun may have flipped status; persist again.
      saveJobs(loadJobs());
      return { success: true, job: record };
    },
    list() { return loadJobs(); },
    cancel(id) {
      clearTimers(id);
      const jobs = loadJobs();
      const job = getJob(jobs, id);
      if (job && (job.status === 'scheduled' || job.status === 'recording')) {
        if (job.status === 'recording') { try { recordingManager.stopRecording(id); } catch (e) {} }
        job.status = 'canceled';
        saveJobs(jobs);
      }
      return { success: true };
    },
  };
}

module.exports = { reconcileJob, createScheduler, STORE_KEY };
