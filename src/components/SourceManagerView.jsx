import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useProfilesStore, useActiveProfile } from '../store/profileStore';
import { useAppStore } from '../store/appStore.js';
import { LucideLink, LucideFile, LucideServer, LucideGlobe, LucideTrash2, LucidePlay, LucideCheckCircle2, LucideAlertCircle, LucideCalendarClock, LucideUsers, LucideRefreshCw, LucideLoader2 } from 'lucide-react';
import { loadPlaylist } from '../lib/m3u/playlistService.js';
import { savePlaylistToCache } from '../lib/m3u/playlistCache.js';
import { resolveMediaItem } from '../lib/media/mediaResolver.js';
import { toMediaItem } from '../lib/media/mediaAdapter.js';
import { useEntitlementsStore } from '../store/entitlementsStore.js';
import UpsellModal from './UpsellModal.jsx';

export default function SourceManagerView() {
  const [activeTab, setActiveTab] = useState('m3u_url');
  
  return (
    <div className="flex h-full w-full bg-[#0a1f22] text-gray-200">
      {/* Sidebar / Tabs */}
      <div className="w-64 bg-[#0c2a2d] border-r border-gray-700 flex flex-col">
        <div className="p-6">
          <h2 className="text-xl font-bold tracking-tight text-white mb-1">Sources</h2>
          <p className="text-xs text-gray-400">Manage your media providers</p>
        </div>
        
        <div className="flex-1 overflow-y-auto px-4 space-y-2">
          <TabButton 
            active={activeTab === 'm3u_url'} 
            onClick={() => setActiveTab('m3u_url')}
            icon={<LucideLink size={18} />} 
            label="M3U URL" 
          />
          <TabButton 
            active={activeTab === 'local_file'} 
            onClick={() => setActiveTab('local_file')}
            icon={<LucideFile size={18} />} 
            label="Local File" 
          />
          <TabButton
            active={activeTab === 'xtream'}
            onClick={() => setActiveTab('xtream')}
            icon={<LucideServer size={18} />}
            label="Xtream Codes"
          />
          <TabButton 
            active={activeTab === 'stalker'} 
            onClick={() => setActiveTab('stalker')}
            icon={<LucideGlobe size={18} />} 
            label="Stalker Portal" 
            badge="Soon"
          />
          <TabButton 
            active={activeTab === 'diagnostics'} 
            onClick={() => setActiveTab('diagnostics')}
            icon={<LucideAlertCircle size={18} />} 
            label="Diagnostics" 
          />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col relative overflow-hidden bg-gradient-to-br from-[#0a1f22] to-[#0d2e33]">
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-4xl mx-auto space-y-12">
            {activeTab === 'm3u_url' && <M3uUrlManager />}
            {activeTab === 'local_file' && <LocalFileManager />}
            {activeTab === 'xtream' && <XtreamManager />}
            {activeTab === 'stalker' && <ComingSoonManager />}
            {activeTab === 'diagnostics' && <MediaDiagnostics />}
            
            <div className="border-t border-gray-700 pt-8 mt-12">
              <h3 className="text-lg font-semibold text-white mb-4">Saved Playlists</h3>
              <SavedPlaylistsList />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label, badge }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-all duration-200 ${
        active 
          ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 shadow-inner' 
          : 'text-gray-400 hover:bg-white/5 hover:text-gray-200 border border-transparent'
      }`}
    >
      <div className="flex items-center gap-3">
        {icon}
        <span className="font-medium text-sm">{label}</span>
      </div>
      {badge && (
        <span className="text-[10px] uppercase font-bold tracking-wider bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full">
          {badge}
        </span>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementations
// ─────────────────────────────────────────────────────────────────────────────

function M3uUrlManager() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState({ type: '', msg: '' });
  const [isProcessing, setIsProcessing] = useState(false);
  const abortControllerRef = useRef(null);
  
  const addM3uPlaylist = useProfilesStore((s) => s.addM3uPlaylist);
  const isPro = useEntitlementsStore((s) => s.isPro());
  const hydrated = useEntitlementsStore((s) => s.hydrated);
  const activeProfile = useActiveProfile();
  const [upsellOpen, setUpsellOpen] = useState(false);

  const handleAdd = async () => {
    if (!url) return;
    // Before hydration we don't yet know the real tier — let the add through
    // rather than falsely upselling a Pro user; enforcement re-applies on the
    // very next attempt once hydrated settles.
    if (hydrated && !isPro && (activeProfile?.playlists || []).length >= 1) {
      setUpsellOpen(true);
      return;
    }
    if (isProcessing) {
       abortControllerRef.current?.abort();
    }
    
    abortControllerRef.current = new AbortController();
    setIsProcessing(true);
    setStatus({ type: 'loading', msg: 'Checking playlist link...' });
    
    try {
      const result = await loadPlaylist(
        url, 
        abortControllerRef.current.signal,
        (state, msg) => {
          if (state === 'validating' || state === 'downloading' || state === 'parsing') {
            setStatus({ type: 'loading', msg });
          }
        }
      );
      
      if (abortControllerRef.current?.signal.aborted) {
         setStatus({ type: 'error', msg: 'Request cancelled.' });
         setIsProcessing(false);
         return;
      }
      
      if (!result.success) {
        setStatus({ type: 'error', msg: result.error });
        setIsProcessing(false);
        return;
      }

      await savePlaylistToCache(url, result);

      setStatus({ type: 'success', msg: `Found ${result.channelCount} channels. ✓ Playlist ready` });
      
      addM3uPlaylist({
        name: "M3U Playlist",
        url: url,
        status: 'ready',
        channelCount: result.channelCount,
        lastUpdated: Date.now()
      });

      // ── Phase 1: SQLite pipeline bridge ───────────────────────────────────
      // Also ingest into the SQLite pipeline (Path B) so VOD / Series /
      // DB-backed search are populated. This is intentionally NON-FATAL: the
      // Live TV path above (profileStore + IndexedDB) remains the source of
      // truth for now and must never be blocked by a database failure.
      try {
        if (typeof window !== 'undefined' && window.electronDB) {
          const state = useProfilesStore.getState();
          const profile = state.getActiveProfile();
          // Reuse the profile playlist id as the DB playlist id so the two
          // records stay linked (upsert-by-id makes re-adds idempotent).
          const created = profile?.playlists?.find((p) => p.url === url);
          if (profile && created?.id) {
            await state.addPlaylistToDB(profile.id, {
              id: created.id,
              name: created.name,
              url: created.url,
              type: 'm3u',
            });
            await state.setActivePlaylistInDB(created.id);
          }
        }
      } catch (dbErr) {
        console.error('[SourceManager] SQLite ingestion failed (non-fatal):', dbErr);
      }

      setUrl("");
    } catch (err) {
      if (err.name === 'AbortError') {
        setStatus({ type: 'error', msg: 'Request cancelled.' });
      } else {
        setStatus({ type: 'error', msg: 'Failed to add playlist.' });
      }
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-white mb-2">Add M3U Playlist</h2>
        <p className="text-gray-400">Import channels and EPG data from a remote URL.</p>
      </div>

      <div className="bg-[#123236] p-6 rounded-xl border border-gray-700 shadow-xl space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Playlist URL</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://example.com/playlist.m3u"
            className="w-full bg-[#0a1f22] border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
        </div>
        
        <div className="flex items-center justify-between pt-2">
          <div className="flex-1 mr-4">
            <StatusMessage status={status} />
          </div>
          <button
            onClick={handleAdd}
            disabled={!url || isProcessing}
            className={`px-6 py-2.5 rounded-lg font-medium transition-all ${
              !url || isProcessing 
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20'
            }`}
          >
            {isProcessing ? 'Importing...' : 'Add Source'}
          </button>
        </div>
      </div>
      <UpsellModal
        open={upsellOpen}
        onClose={() => setUpsellOpen(false)}
        reason="The free tier includes 1 source. Add unlimited sources with Matrix Pro."
      />
    </div>
  );
}

function LocalFileManager() {
  const [dragActive, setDragActive] = useState(false);
  const [status, setStatus] = useState({ type: '', msg: '' });
  const fileInputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (file) => {
    if (!file.name.match(/\.(m3u|m3u8|txt)$/i)) {
      setStatus({ type: 'error', msg: 'Invalid file type. Please upload an M3U file.' });
      return;
    }
    setStatus({ type: 'success', msg: `Local file parsing is coming in the next commit. File selected: ${file.name}` });
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-white mb-2">Local File</h2>
        <p className="text-gray-400">Import an M3U playlist from your computer.</p>
      </div>

      <div 
        className={`relative flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-xl transition-all duration-200 ${
          dragActive 
            ? 'border-blue-500 bg-blue-500/10' 
            : 'border-gray-600 bg-[#123236] hover:border-gray-500 hover:bg-[#15383d]'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <div className="w-16 h-16 bg-[#0a1f22] rounded-full flex items-center justify-center mb-4 shadow-inner">
          <LucideFile size={28} className="text-blue-400" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">Drag & Drop M3U File Here</h3>
        <p className="text-gray-400 mb-6 text-sm">or click to browse your computer</p>
        
        <input
          ref={fileInputRef}
          type="file"
          accept=".m3u,.m3u8,.txt"
          onChange={handleChange}
          className="hidden"
        />
        
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-6 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
        >
          Browse Files
        </button>
      </div>
      
      <div className="mt-4">
        <StatusMessage status={status} />
      </div>
    </div>
  );
}

function ComingSoonManager() {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col items-center justify-center py-20">
      <div className="w-20 h-20 bg-[#123236] rounded-2xl flex items-center justify-center mb-6 border border-gray-700">
        <LucideServer size={32} className="text-gray-500" />
      </div>
      <h2 className="text-2xl font-bold text-white mb-2">Coming Soon</h2>
      <p className="text-gray-400 max-w-md text-center">
        Support for Xtream Codes and Stalker Portals is under active development. 
        Check back in a future update!
      </p>
    </div>
  );
}

function SavedPlaylistsList() {
  const activeProfile = useActiveProfile();
  const removePlaylist = useProfilesStore((s) => s.removePlaylist);
  const updatePlaylist = useProfilesStore((s) => s.updatePlaylist);
  const setMediaState = useAppStore((s) => s.setMediaState);
  const setCategories = useAppStore((s) => s.setCategories);
  const setEpgUrl = useAppStore((s) => s.setEpgUrl);
  const playlists = activeProfile?.playlists || [];
  const [refreshingId, setRefreshingId] = useState(null);
  const abortControllers = useRef({});

  const handleRefresh = async (playlist, isFirst) => {
    if (refreshingId === playlist.id || playlist.status === 'downloading') return;
    
    // Abort previous if exists
    if (abortControllers.current[playlist.id]) {
       abortControllers.current[playlist.id].abort();
    }
    
    const ac = new AbortController();
    abortControllers.current[playlist.id] = ac;
    
    setRefreshingId(playlist.id);
    updatePlaylist(playlist.id, { status: 'downloading' });
    
    try {
      const result = await loadPlaylist(playlist.url, ac.signal);
      
      if (ac.signal.aborted) {
         updatePlaylist(playlist.id, { status: 'failed', lastError: 'Request cancelled.' });
         return;
      }
      
      if (!result.success) {
         updatePlaylist(playlist.id, { status: 'failed', lastError: result.error });
         return;
      }
      
      await savePlaylistToCache(playlist.url, result);
      
      if (isFirst) {
         // Route through the media adapter so Movies/Series views stay in sync
         setMediaState(result.channels.map(c => toMediaItem(c, playlist.id)));
         setCategories(result.categories);
         setEpgUrl(result.epgUrl);
      }
      
      updatePlaylist(playlist.id, {
        status: 'ready',
        channelCount: result.channelCount,
        lastUpdated: Date.now(),
        lastError: null
      });

      // ── Phase 1B: keep SQLite (Path B) in sync on manual refresh ──────────
      // Re-run the main-process ingestion so channels/VOD/series stay current.
      // Non-fatal: the renderer refresh above already updated the Live TV view
      // and IndexedDB, so a DB failure must not surface to the user.
      try {
        if (typeof window !== 'undefined' && window.electronDB && playlist.id) {
          await window.electronDB.syncPlaylist(playlist.id);
        }
      } catch (dbErr) {
        console.error('[SourceManager] SQLite resync on refresh failed (non-fatal):', dbErr);
      }

    } catch (e) {
      if (!ac.signal.aborted) {
        updatePlaylist(playlist.id, { status: 'failed', lastError: 'Unable to refresh playlist.' });
      }
    } finally {
      // Compare against current state, not the stale closure value —
      // otherwise the spinner never clears and refresh locks up.
      setRefreshingId(prev => (prev === playlist.id ? null : prev));
    }
  };

  if (playlists.length === 0) {
    return (
      <div className="text-center py-12 bg-[#123236] rounded-xl border border-gray-700 shadow-inner">
        <LucideLink size={32} className="mx-auto text-gray-500 mb-4 opacity-50" />
        <p className="text-gray-300 font-medium text-lg">No Providers Connected</p>
        <p className="text-gray-500 text-sm mt-2">Add a media source above to populate your library</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {playlists.map((playlist, idx) => {
        const isRefreshing = refreshingId === playlist.id || playlist.status === 'downloading';
        const isError = playlist.status === 'failed';
        
        let statusColor = "bg-green-500";
        if (isRefreshing) statusColor = "bg-blue-500 animate-pulse";
        if (isError) statusColor = "bg-red-500";
        
        const lastSync = playlist.lastUpdated ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric' }).format(new Date(playlist.lastUpdated)) : 'Never';
        
        return (
          <div key={playlist.id || idx} className={`flex flex-col p-5 bg-[#123236] rounded-xl border ${isError ? 'border-red-900/50' : 'border-gray-700'} shadow-md group transition-all`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-5 overflow-hidden w-2/3">
                <div className="w-12 h-12 rounded-xl bg-[#0a1f22] border border-gray-600 flex items-center justify-center shrink-0 shadow-inner">
                  <LucideLink size={20} className="text-blue-400" />
                </div>
                <div className="truncate pr-4 w-full">
                  <div className="text-base font-semibold text-white truncate mb-1">{playlist.name || playlist.url}</div>
                  <div className="flex items-center gap-3 text-xs text-gray-400 font-medium">
                    <span className="flex items-center gap-1">
                      <div className={`w-2 h-2 rounded-full ${statusColor}`}></div> 
                      {isRefreshing ? 'Updating...' : isError ? 'Failed' : 'Connected'}
                    </span>
                    <span>•</span>
                    <span>{playlist.type === 'xtream' ? 'Xtream' : 'M3U Provider'}</span>
                    <span>•</span>
                    <span>{playlist.channelCount ? playlist.channelCount.toLocaleString() : '~'} Channels</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right mr-4 hidden md:block">
                  <div className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1">Last Sync</div>
                  <div className="text-sm text-gray-300">{isRefreshing ? 'Updating...' : lastSync}</div>
                </div>
                
                <button 
                  onClick={() => handleRefresh(playlist, idx === 0)}
                  disabled={isRefreshing}
                  className={`p-2.5 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${isRefreshing ? 'text-blue-400 bg-blue-900/20' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
                  title="Manual Refresh"
                >
                  <LucidePlay size={18} className={isRefreshing ? 'animate-spin' : ''} />
                </button>
                <button 
                  onClick={() => removePlaylist(playlist.id || playlist.url)}
                  className="p-2.5 text-red-400 hover:text-white hover:bg-red-500/20 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
                  title="Remove Provider"
                >
                  <LucideTrash2 size={18} />
                </button>
              </div>
            </div>
            
            {isError && playlist.lastError && (
              <div className="mt-4 pt-3 border-t border-red-900/30 flex items-center gap-2 text-sm text-red-400">
                <LucideAlertCircle size={16} />
                <span>Error: {playlist.lastError}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StatusMessage({ status }) {
  if (!status || !status.msg) return null;

  const config = {
    loading: { icon: <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />, color: 'text-blue-400' },
    success: { icon: <LucideCheckCircle2 size={16} />, color: 'text-green-400' },
    error: { icon: <LucideAlertCircle size={16} />, color: 'text-red-400' },
  }[status.type] || { icon: null, color: 'text-gray-400' };

  return (
    <div className={`flex items-center gap-2 text-sm font-medium ${config.color} animate-in fade-in duration-300`}>
      {config.icon}
      <span>{status.msg}</span>
    </div>
  );
}

function XtreamAccountPanel({ playlist }) {
  const [state, setState] = useState({ status: 'loading', info: null, error: null });

  const load = useCallback(() => {
    const base = (playlist.serverUrl || '').replace(/\/+$/, '');
    if (!base || !playlist.username) { setState({ status: 'error', error: 'Missing stored credentials.' }); return; }
    setState({ status: 'loading', info: null, error: null });
    const url = `${base}/player_api.php?username=${encodeURIComponent(playlist.username)}&password=${encodeURIComponent(playlist.password || '')}`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        if (d && d.user_info) setState({ status: 'ok', info: d, error: null });
        else setState({ status: 'error', error: 'Provider did not return account info.' });
      })
      .catch(() => setState({ status: 'error', error: 'Could not reach the provider.' }));
  }, [playlist.serverUrl, playlist.username, playlist.password]);

  useEffect(() => { load(); }, [load]);

  const ui = state.info?.user_info;
  const srv = state.info?.server_info;
  const exp = ui?.exp_date ? new Date(Number(ui.exp_date) * 1000) : null;
  const daysLeft = exp ? Math.ceil((exp.getTime() - Date.now()) / 86400000) : null;
  const isActive = ui && (ui.status === 'Active' || ui.auth === 1 || ui.auth === '1');
  const isTrial = ui && (ui.is_trial === '1' || ui.is_trial === 1);

  return (
    <div className="bg-[#123236] border border-gray-700 rounded-xl p-5 shadow-lg" data-xtream-account>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <LucideServer size={18} className="text-blue-400 shrink-0" />
          <h3 className="text-lg font-bold text-white truncate">{playlist.name || 'Xtream Source'}</h3>
          {ui && (
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${isActive ? 'bg-green-600/25 text-green-300' : 'bg-red-600/25 text-red-300'}`}>
              {isActive ? 'Active' : (ui.status || 'Inactive')}
            </span>
          )}
          {isTrial && <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/25 text-amber-300">Trial</span>}
        </div>
        <button onClick={load} title="Refresh" className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 shrink-0">
          {state.status === 'loading' ? <LucideLoader2 size={16} className="animate-spin" /> : <LucideRefreshCw size={16} />}
        </button>
      </div>

      {state.status === 'error' && (
        <p className="text-sm text-red-300 flex items-center gap-2"><LucideAlertCircle size={15} /> {state.error}</p>
      )}

      {state.status === 'loading' && !ui && (
        <p className="text-sm text-gray-400">Checking account status…</p>
      )}

      {ui && (
        <div className="grid grid-cols-2 gap-4">
          <InfoTile
            icon={<LucideCalendarClock size={16} className="text-blue-400" />}
            label="Expires"
            value={exp ? exp.toLocaleDateString() : 'Unlimited'}
            sub={daysLeft != null ? (daysLeft >= 0 ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} left` : `Expired ${Math.abs(daysLeft)}d ago`) : null}
            danger={daysLeft != null && daysLeft <= 3}
          />
          <InfoTile
            icon={<LucideUsers size={16} className="text-blue-400" />}
            label="Connections"
            value={`${ui.active_cons ?? 0} / ${ui.max_connections ?? '—'}`}
            sub="active / allowed"
          />
          {srv?.url && (
            <InfoTile icon={<LucideGlobe size={16} className="text-blue-400" />} label="Server" value={srv.url + (srv.port ? `:${srv.port}` : '')} />
          )}
          {srv?.timezone && (
            <InfoTile icon={<LucideGlobe size={16} className="text-blue-400" />} label="Timezone" value={srv.timezone} />
          )}
        </div>
      )}
    </div>
  );
}

function InfoTile({ icon, label, value, sub, danger }) {
  return (
    <div className="bg-black/25 rounded-lg p-3">
      <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">{icon}{label}</div>
      <div className={`text-lg font-bold truncate ${danger ? 'text-red-300' : 'text-white'}`}>{value}</div>
      {sub && <div className={`text-xs mt-0.5 ${danger ? 'text-red-400' : 'text-gray-500'}`}>{sub}</div>}
    </div>
  );
}

function XtreamManager() {
  const [name, setName] = useState('');
  const [server, setServer] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState({ type: '', msg: '' });
  const [isProcessing, setIsProcessing] = useState(false);
  const abortControllerRef = useRef(null);

  const addM3uPlaylist = useProfilesStore((s) => s.addM3uPlaylist);
  const activeProfile = useActiveProfile();
  const isPro = useEntitlementsStore((s) => s.isPro());
  const hydrated = useEntitlementsStore((s) => s.hydrated);
  const [upsellOpen, setUpsellOpen] = useState(false);
  const xtreamPlaylists = (activeProfile?.playlists || []).filter((p) => p.sourceKind === 'xtream' && p.serverUrl);
  const canSubmit = server.trim() && username.trim() && password.trim() && !isProcessing;

  const handleAdd = async () => {
    if (!canSubmit) return;
    // Before hydration we don't yet know the real tier — let the add through
    // rather than falsely upselling a Pro user; enforcement re-applies on the
    // very next attempt once hydrated settles.
    if (hydrated && !isPro && (activeProfile?.playlists || []).length >= 1) {
      setUpsellOpen(true);
      return;
    }

    const base = server.trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(base)) {
      setStatus({ type: 'error', msg: 'Server URL must start with http:// or https://' });
      return;
    }

    abortControllerRef.current = new AbortController();
    setIsProcessing(true);

    try {
      // 1. Validate credentials against the Xtream player API
      setStatus({ type: 'loading', msg: 'Signing in to provider...' });
      const authUrl = `${base}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
      const authRes = await fetch(authUrl, { signal: abortControllerRef.current.signal });
      if (!authRes.ok) throw new Error(`Provider responded with HTTP ${authRes.status}`);
      const auth = await authRes.json().catch(() => null);
      const authOk = auth?.user_info && (auth.user_info.auth === 1 || auth.user_info.auth === '1' || auth.user_info.status === 'Active');
      if (!authOk) {
        setStatus({ type: 'error', msg: 'Login failed — check your username and password.' });
        setIsProcessing(false);
        return;
      }

      // 2. Download the full playlist through the standard get.php endpoint
      const m3uUrl = `${base}/get.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&type=m3u_plus&output=ts`;
      const epgUrl = `${base}/xmltv.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;

      setStatus({ type: 'loading', msg: 'Downloading channel list...' });
      const result = await loadPlaylist(m3uUrl, abortControllerRef.current.signal, (state, msg) => {
        setStatus({ type: 'loading', msg });
      });

      if (!result.success) {
        setStatus({ type: 'error', msg: result.error || 'Could not download the channel list.' });
        setIsProcessing(false);
        return;
      }

      await savePlaylistToCache(m3uUrl, result);

      // 3. Save as a playlist; the whole existing M3U pipeline takes over.
      addM3uPlaylist({
        name: name.trim() || auth.user_info.username || 'Xtream Source',
        url: m3uUrl,
        epgUrl,
        serverUrl: base,
        username,
        password,
        sourceKind: 'xtream',
        status: 'ready',
        channelCount: result.channelCount,
        lastUpdated: Date.now(),
      });

      // SQLite bridge (non-fatal), mirrors the M3U flow
      try {
        if (typeof window !== 'undefined' && window.electronDB) {
          const state = useProfilesStore.getState();
          const profile = state.getActiveProfile();
          const created = profile?.playlists?.find((p) => p.url === m3uUrl);
          if (profile && created?.id) {
            await state.addPlaylistToDB(profile.id, { id: created.id, name: created.name, url: created.url, type: 'm3u' });
            await state.setActivePlaylistInDB(created.id);
          }
        }
      } catch (dbErr) {
        console.error('[SourceManager] SQLite ingestion failed (non-fatal):', dbErr);
      }

      setStatus({ type: 'success', msg: `Connected! ${result.channelCount} items imported (live, movies & series). ✓` });
      setName(''); setServer(''); setUsername(''); setPassword('');
    } catch (err) {
      if (err.name === 'AbortError') {
        setStatus({ type: 'error', msg: 'Request cancelled.' });
      } else {
        console.error('[Xtream] add failed:', err);
        setStatus({ type: 'error', msg: 'Could not reach the server. Check the URL and your connection.' });
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const field = 'w-full bg-[#0a1f22] border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow';

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      {xtreamPlaylists.length > 0 && (
        <div className="mb-10 space-y-4">
          <h2 className="text-2xl font-bold text-white">Your Xtream account{xtreamPlaylists.length > 1 ? 's' : ''}</h2>
          {xtreamPlaylists.map((p) => <XtreamAccountPanel key={p.id} playlist={p} />)}
        </div>
      )}

      <div className="mb-8">
        <h2 className="text-3xl font-bold text-white mb-2">Xtream Codes Login</h2>
        <p className="text-gray-400">Sign in with the server, username and password from your provider. Live TV, movies and series import automatically.</p>
      </div>

      <div className="bg-[#123236] p-6 rounded-xl border border-gray-700 shadow-xl space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Display name (optional)</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Provider" className={field} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Server URL</label>
          <input type="url" value={server} onChange={(e) => setServer(e.target.value)} placeholder="http://provider.example.com:8080" className={field} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Username</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" className={field} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" className={field}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()} />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="flex-1 mr-4">
            <StatusMessage status={status} />
          </div>
          <button
            onClick={handleAdd}
            disabled={!canSubmit}
            className={`px-6 py-2.5 rounded-lg font-medium transition-all ${
              !canSubmit
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20'
            }`}
          >
            {isProcessing ? 'Connecting...' : 'Sign In & Import'}
          </button>
        </div>
      </div>
      <UpsellModal
        open={upsellOpen}
        onClose={() => setUpsellOpen(false)}
        reason="The free tier includes 1 source. Add unlimited sources with Matrix Pro."
      />
    </div>
  );
}

function MediaDiagnostics() {
  const media = useAppStore((s) => s.media);
  const activeProfile = useActiveProfile();

  const liveCount = media?.live?.length || 0;
  const moviesCount = media?.movies?.length || 0;
  const seriesCount = media?.series?.length || 0;
  const unsortedCount = media?.unsorted?.length || 0;

  const favorites = activeProfile?.favorites || [];
  const resolvedFavs = favorites.map(id => resolveMediaItem(id)).filter(Boolean);
  
  const history = activeProfile?.watchHistory || [];
  const resolvedHistory = history.map(item => {
    const id = typeof item === 'string' ? item : (item.channelId || item.id);
    return resolveMediaItem(id);
  }).filter(Boolean);

  return (
    <div className="bg-black/20 rounded-xl p-8 border border-white/5 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Media Classification Report</h2>
        <p className="text-gray-400">Current in-memory store metrics</p>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white/5 p-4 rounded-lg border border-blue-500/20">
          <div className="text-sm text-gray-400 mb-1">Live TV</div>
          <div className="text-2xl font-bold text-blue-400">{liveCount}</div>
        </div>
        
        <div className="bg-white/5 p-4 rounded-lg border border-purple-500/20">
          <div className="text-sm text-gray-400 mb-1">Movies</div>
          <div className="text-2xl font-bold text-purple-400">{moviesCount}</div>
        </div>
        
        <div className="bg-white/5 p-4 rounded-lg border border-pink-500/20">
          <div className="text-sm text-gray-400 mb-1">Series</div>
          <div className="text-2xl font-bold text-pink-400">{seriesCount}</div>
        </div>
        
        <div className="bg-white/5 p-4 rounded-lg border border-yellow-500/20">
          <div className="text-sm text-gray-400 mb-1">Unknown (Unsorted)</div>
          <div className="text-2xl font-bold text-yellow-400">{unsortedCount}</div>
        </div>
      </div>
      
      <div className="mt-8">
        <h3 className="text-lg font-bold text-white mb-4 border-b border-white/10 pb-2">Identity Bridge Resolution</h3>
        
        <div className="space-y-4">
          <div className="flex justify-between items-center p-3 bg-white/5 rounded-lg border border-white/5">
            <span className="text-gray-300">Favorites Resolved</span>
            <span className={`font-mono font-bold ${resolvedFavs.length === favorites.length ? 'text-green-400' : 'text-yellow-400'}`}>
              {resolvedFavs.length} / {favorites.length}
            </span>
          </div>
          
          <div className="flex justify-between items-center p-3 bg-white/5 rounded-lg border border-white/5">
            <span className="text-gray-300">Watch History Resolved</span>
            <span className={`font-mono font-bold ${resolvedHistory.length === history.length ? 'text-green-400' : 'text-yellow-400'}`}>
              {resolvedHistory.length} / {history.length}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
