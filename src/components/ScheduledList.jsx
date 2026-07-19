import React, { useEffect, useState, useCallback } from 'react';

const STATUS_STYLE = {
  scheduled: { label: 'Scheduled', color: '#38bdf8' },
  recording: { label: 'Recording', color: '#ef4444' },
  completed: { label: 'Completed', color: '#10b981' },
  missed:    { label: 'Missed',    color: '#f59e0b' },
  canceled:  { label: 'Canceled',  color: '#64748b' },
};

function fmt(ms) { try { return new Date(ms).toLocaleString(); } catch { return ''; } }

export default function ScheduledList() {
  const [jobs, setJobs] = useState([]);

  const refresh = useCallback(async () => {
    if (!window.electronSchedule?.list) { setJobs([]); return; }
    try { setJobs(await window.electronSchedule.list()); } catch (e) { /* ignore */ }
  }, []);

  useEffect(() => {
    refresh();
    const off = window.electronSchedule?.onUpdate?.((list) => setJobs(list || []));
    return () => { if (off) off(); };
  }, [refresh]);

  const cancel = useCallback(async (id) => {
    await window.electronSchedule.cancel(id);
    refresh();
  }, [refresh]);

  const sorted = [...jobs].sort((a, b) => a.startMs - b.startMs);

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-12">
        <div className="text-6xl mb-6 opacity-40">🗓️</div>
        <div className="text-xl font-bold text-slate-300 mb-2">No Scheduled Recordings</div>
        <div className="text-sm text-slate-500 max-w-sm">Open the TV Guide, focus a future program, and press ● Rec to schedule it.</div>
      </div>
    );
  }

  return (
    <div className="p-6 flex flex-col gap-3">
      {sorted.map((job) => {
        const st = STATUS_STYLE[job.status] || STATUS_STYLE.scheduled;
        const active = job.status === 'scheduled' || job.status === 'recording';
        return (
          <div key={job.id} className="flex items-center justify-between bg-[#111827] border border-white/10 rounded-xl p-4">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-100 truncate">{job.title || job.channelName}</div>
              <div className="text-xs text-slate-500 mt-1 truncate">{job.channelName} · {fmt(job.startMs)} → {fmt(job.stopMs)}</div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-xs font-bold uppercase tracking-wide px-2 py-1 rounded" style={{ color: st.color, backgroundColor: `${st.color}22`, border: `1px solid ${st.color}44` }}>{st.label}</span>
              {active && (
                <button onClick={() => cancel(job.id)} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-600/15 text-red-300 border border-red-500/30 hover:bg-red-600/25 focus:outline-none">Cancel</button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
