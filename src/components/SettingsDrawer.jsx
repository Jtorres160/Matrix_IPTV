import React, { useState, useEffect } from 'react';
import { useActiveSettings, useProfilesStore } from '../store/profileStore';
import ProfileSwitcher from '../ProfileSwitcher.jsx';
import { useAppStore } from '../store/appStore.js';
import { useEntitlementsStore } from '../store/entitlementsStore.js';
import {
  LucideSettings, LucidePalette, LucideMonitorPlay, LucideDatabase,
  LucideUsers, LucideTerminal, LucideInfo, LucideX, LucideChevronRight,
  LucideCalendarDays, LucideKeyboard, LucideKey
} from 'lucide-react';

export default function SettingsDrawer({ isOpen, onClose }) {
  const [activeSection, setActiveSection] = useState('appearance');
  
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity animate-in fade-in duration-300"
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-[500px] bg-[#111114] border-l border-[var(--hairline)] shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--hairline)] bg-black/40">
          <div className="flex items-center gap-3 text-white">
            <LucideSettings size={24} className="text-[#E8B15A]" />
            <h2 className="text-xl font-bold tracking-tight">Settings</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[#E8B15A]/70"
          >
            <LucideX size={20} />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex flex-1 overflow-hidden">
          
          {/* Sidebar */}
          <div className="w-48 bg-black/40/50 border-r border-[var(--hairline)] p-4 space-y-1 overflow-y-auto">
            <SectionButton id="appearance" icon={<LucidePalette size={16} />} label="Appearance" active={activeSection === 'appearance'} onClick={setActiveSection} />
            <SectionButton id="playback" icon={<LucideMonitorPlay size={16} />} label="Playback" active={activeSection === 'playback'} onClick={setActiveSection} />
            <SectionButton id="guide" icon={<LucideCalendarDays size={16} />} label="Guide & Data" active={activeSection === 'guide'} onClick={setActiveSection} />
            <SectionButton id="sources" icon={<LucideDatabase size={16} />} label="Sources" active={activeSection === 'sources'} onClick={setActiveSection} />
            <SectionButton id="profiles" icon={<LucideUsers size={16} />} label="Profiles" active={activeSection === 'profiles'} onClick={setActiveSection} />
            <SectionButton id="license" icon={<LucideKey size={16} />} label="License" active={activeSection === 'license'} onClick={setActiveSection} />
            <SectionButton id="shortcuts" icon={<LucideKeyboard size={16} />} label="Shortcuts" active={activeSection === 'shortcuts'} onClick={setActiveSection} />
            <SectionButton id="advanced" icon={<LucideTerminal size={16} />} label="Advanced" active={activeSection === 'advanced'} onClick={setActiveSection} />
            <div className="my-4 border-t border-[var(--hairline)]/50"></div>
            <SectionButton id="about" icon={<LucideInfo size={16} />} label="About" active={activeSection === 'about'} onClick={setActiveSection} />
          </div>

          {/* Settings Pane */}
          <div className="flex-1 p-6 overflow-y-auto">
            {activeSection === 'appearance' && <AppearanceSettings />}
            {activeSection === 'playback' && <PlaybackSettings />}
            {activeSection === 'guide' && <GuideDataSettings />}
            {activeSection === 'sources' && <SourcesShortcut onClose={onClose} />}
            {activeSection === 'profiles' && <ProfilesSettings />}
            {activeSection === 'license' && <LicenseSettings />}
            {activeSection === 'shortcuts' && <ShortcutsSettings />}
            {activeSection === 'advanced' && <AdvancedSettings />}
            {activeSection === 'about' && <AboutSettings />}
          </div>
        </div>
      </div>
    </>
  );
}

function SectionButton({ id, icon, label, active, onClick }) {
  return (
    <button
      onClick={() => onClick(id)}
      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
        active 
          ? 'u-pill-active shadow-md' 
          : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
      }`}
    >
      <div className="flex items-center gap-3">
        {icon}
        {label}
      </div>
      {active && <LucideChevronRight size={14} className="opacity-70" />}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared controls
// ─────────────────────────────────────────────────────────────────────────────

function ToggleRow({ title, subtitle, checked, onChange }) {
  return (
    <div className="p-4 bg-[#17171B] rounded-xl border border-[var(--hairline)]">
      <label className="flex items-center justify-between cursor-pointer gap-4">
        <div>
          <div className="font-medium text-white">{title}</div>
          <div className="text-sm text-gray-400 mt-1">{subtitle}</div>
        </div>
        <div className="relative shrink-0">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
          />
          <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#E8B15A]/70 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#E8B15A]"></div>
        </div>
      </label>
    </div>
  );
}

/**
 * Text setting with an explicit Save button. Saving on every keystroke would
 * re-trigger the effects that consume these values (EPG refetch, UA reset).
 */
function TextFieldRow({ title, subtitle, value, placeholder, onSave, type = 'text' }) {
  const [draft, setDraft] = useState(value || '');
  const dirty = draft !== (value || '');

  return (
    <div className="p-4 bg-[#17171B] rounded-xl border border-[var(--hairline)]">
      <div className="font-medium text-white">{title}</div>
      <div className="text-sm text-gray-400 mt-1 mb-3">{subtitle}</div>
      <div className="flex gap-2">
        <input
          type={type}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && dirty) onSave(draft.trim()); }}
          className="flex-1 bg-black/40 border border-[var(--hairline)] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#E8B15A]/70"
        />
        <button
          onClick={() => onSave(draft.trim())}
          disabled={!dirty}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors u-pill-active disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Save
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sections
// ─────────────────────────────────────────────────────────────────────────────

function AppearanceSettings() {
  const activeSettings = useActiveSettings();
  const updateSettings = useProfilesStore((s) => s.updateSettings);
  const darkMode = activeSettings?.theme === 'dark';

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h3 className="text-lg font-semibold text-white mb-1">Appearance</h3>
        <p className="text-sm text-gray-400 mb-6">Customize the look and feel of the application.</p>
      </div>

      <div className="space-y-4">
        <div className="p-4 bg-[#17171B] rounded-xl border border-[var(--hairline)]">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="font-medium text-white">Application Theme</div>
              <div className="text-sm text-gray-400">Choose between light and dark modes</div>
            </div>
            <select
              value={darkMode ? "dark" : "light"}
              onChange={(e) => updateSettings({ theme: e.target.value })}
              className="bg-black/40 border border-[var(--hairline)] rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[#E8B15A]/70"
            >
              <option value="dark">Dark Mode</option>
              <option value="light">Light Mode</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlaybackSettings() {
  const activeSettings = useActiveSettings();
  const updateSettings = useProfilesStore((s) => s.updateSettings);
  const playerPreference = activeSettings?.playerPreference || 'internal';

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h3 className="text-lg font-semibold text-white mb-1">Playback Engine</h3>
        <p className="text-sm text-gray-400 mb-6">Configure how media streams are handled.</p>
      </div>

      <div className="space-y-4">
        <label 
          className={`flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-all ${
            playerPreference === 'internal' 
              ? 'bg-[#E8B15A]/10 border-[#E8B15A]' 
              : 'bg-[#17171B] border-[var(--hairline)] hover:border-gray-500'
          }`}
        >
          <input 
            type="radio" 
            name="player" 
            value="internal" 
            checked={playerPreference === 'internal'}
            onChange={(e) => updateSettings({ playerPreference: e.target.value })}
            className="mt-1"
          />
          <div>
            <div className="font-medium text-white">Internal Web Player (ReactPlayer)</div>
            <div className="text-sm text-gray-400 mt-1">Best for standard formats. High compatibility, zero setup.</div>
          </div>
        </label>

        <label 
          className={`flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-all ${
            playerPreference === 'vlc' 
              ? 'bg-[#E8B15A]/10 border-[#E8B15A]' 
              : 'bg-[#17171B] border-[var(--hairline)] hover:border-gray-500'
          }`}
        >
          <input 
            type="radio" 
            name="player" 
            value="vlc" 
            checked={playerPreference === 'vlc'}
            onChange={(e) => updateSettings({ playerPreference: e.target.value })}
            className="mt-1"
          />
          <div>
            <div className="font-medium text-white">VLC Media Player (External App)</div>
            <div className="text-sm text-gray-400 mt-1">Spawns VLC for maximum codec support. Requires VLC to be installed on your system.</div>
          </div>
        </label>
        
        <label
          className={`flex items-start gap-4 p-4 rounded-xl border cursor-not-allowed opacity-50 bg-[#17171B] border-[var(--hairline)]`}
        >
          <input
            type="radio"
            name="player"
            value="embeddedVLC"
            disabled
            className="mt-1"
          />
          <div>
            <div className="font-medium text-white">Embedded VLC Engine</div>
            <div className="text-sm text-yellow-500 mt-1">Under development. Coming in Phase 14.</div>
          </div>
        </label>

        <ToggleRow
          title="Resume last channel on launch"
          subtitle="Automatically start playing the channel you were last watching when the app opens"
          checked={!!activeSettings?.autoplayLastChannel}
          onChange={(v) => updateSettings({ autoplayLastChannel: v })}
        />
      </div>
    </div>
  );
}

function GuideDataSettings() {
  const activeSettings = useActiveSettings();
  const updateSettings = useProfilesStore((s) => s.updateSettings);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h3 className="text-lg font-semibold text-white mb-1">Guide & Data</h3>
        <p className="text-sm text-gray-400 mb-6">TV guide sources, refresh behavior, and metadata enrichment.</p>
      </div>

      <div className="space-y-4">
        <ToggleRow
          title="Auto-refresh on startup"
          subtitle="Silently re-download playlists and EPG in the background each time the app starts"
          checked={!!activeSettings?.autoRefresh}
          onChange={(v) => updateSettings({ autoRefresh: v })}
        />

        <TextFieldRow
          title="Custom EPG source (XMLTV)"
          subtitle="Overrides the EPG URL embedded in your playlist. Leave empty to use the playlist's own guide."
          value={activeSettings?.epgUrlOverride || ''}
          placeholder="https://example.com/guide.xml"
          onSave={(v) => updateSettings({ epgUrlOverride: v })}
        />

        <TextFieldRow
          title="TMDB API key (optional)"
          subtitle="Enables movie & series enrichment: plots, ratings and artwork on detail pages. Get a free key at themoviedb.org."
          value={activeSettings?.tmdbApiKey || ''}
          placeholder="Your TMDB API key"
          onSave={(v) => updateSettings({ tmdbApiKey: v })}
        />
      </div>
    </div>
  );
}

function ShortcutsSettings() {
  const shortcuts = [
    ['G', 'Open the TV guide (Live TV)'],
    ['0–9', 'Type a channel number to switch channels'],
    ['Enter', 'Select / play the focused item'],
    ['↑ / ↓', 'Volume up / down (while watching)'],
    ['← / →', 'Previous / next channel (while watching)'],
    ['Space', 'Play / pause (while watching)'],
    ['F', 'Toggle fullscreen (while watching)'],
    ['M', 'Mute / unmute (while watching)'],
    ['T', 'Theater mode (while watching)'],
    ['Esc / Backspace', 'Exit player / go back to Live TV'],
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h3 className="text-lg font-semibold text-white mb-1">Keyboard Shortcuts</h3>
        <p className="text-sm text-gray-400 mb-6">Control the app with your keyboard or TV remote.</p>
      </div>

      <div className="bg-[#17171B] rounded-xl border border-[var(--hairline)] divide-y divide-gray-700/60">
        {shortcuts.map(([key, desc]) => (
          <div key={key} className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-gray-300">{desc}</span>
            <kbd className="px-2.5 py-1 bg-black/40 border border-[var(--hairline)] rounded-md text-xs font-mono text-[#F0C27B] whitespace-nowrap ml-4">
              {key}
            </kbd>
          </div>
        ))}
      </div>
    </div>
  );
}

function SourcesShortcut({ onClose }) {
  const setCurrentView = useAppStore(s => s.setCurrentView);
  
  return (
    <div className="space-y-6 animate-in fade-in duration-300 h-full flex flex-col justify-center text-center px-4">
      <LucideDatabase size={48} className="mx-auto text-[#E8B15A] mb-4 opacity-80" />
      <h3 className="text-xl font-bold text-white">Media Sources</h3>
      <p className="text-gray-400">
        Provider configuration is a primary workflow and has been moved to its own dedicated page.
      </p>
      <button 
        onClick={() => {
          setCurrentView('playlists');
          onClose();
        }}
        className="mt-6 px-6 py-3 u-pill-active rounded-lg font-medium transition-all shadow-lg mx-auto"
      >
        Open Source Manager
      </button>
    </div>
  );
}

function ProfilesSettings() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h3 className="text-lg font-semibold text-white mb-1">Profiles</h3>
        <p className="text-sm text-gray-400 mb-6">Switch accounts or manage settings per-user.</p>
      </div>
      <div className="p-4 bg-[#17171B] rounded-xl border border-[var(--hairline)]">
        <ProfileSwitcher />
      </div>
    </div>
  );
}

function LicenseSettings() {
  const { tier, email, issued, hydrated, refresh, activate, deactivate } = useEntitlementsStore();
  const [key, setKey] = useState('');
  const [status, setStatus] = useState({ type: '', msg: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => { refresh(); }, [refresh]);

  const isPro = tier === 'pro';

  const handleActivate = async () => {
    if (!key.trim() || busy) return;
    setBusy(true);
    setStatus({ type: '', msg: '' });
    try {
      const res = await activate(key.trim());
      setStatus(res?.success
        ? { type: 'success', msg: 'License activated.' }
        : { type: 'error', msg: res?.error || 'That key was not accepted.' });
      if (res?.success) setKey('');
    } finally {
      setBusy(false);
    }
  };

  const handleDeactivate = async () => {
    setBusy(true);
    try {
      await deactivate();
      setStatus({ type: 'success', msg: 'License deactivated.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h3 className="text-lg font-semibold text-white mb-1">License</h3>
        <p className="text-sm text-gray-400 mb-6">Activate Matrix Pro to unlock DVR recording, Recordings, and unlimited sources.</p>
      </div>

      <div className="p-4 bg-[#17171B] rounded-xl border border-[var(--hairline)]">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium text-white">{isPro ? 'Matrix Pro (active)' : 'Free tier'}</div>
            {isPro && email && <div className="text-sm text-gray-400 mt-1">Licensed to {email}{issued ? ` · activated ${new Date(issued).toLocaleDateString()}` : ''}</div>}
          </div>
          <span className={`text-xs font-bold uppercase tracking-wide px-2 py-1 rounded ${isPro ? 'bg-[#E8B15A]/20 text-[#F0C27B]' : 'bg-gray-600/40 text-gray-300'}`}>
            {isPro ? 'Pro' : 'Free'}
          </span>
        </div>
      </div>

      {!isPro && (
        <div className="p-4 bg-[#17171B] rounded-xl border border-[var(--hairline)] space-y-3">
          <div className="font-medium text-white">Activate a license</div>
          <div className="flex gap-2">
            <input
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleActivate()}
              placeholder="Paste your license key"
              className="flex-1 bg-black/40 border border-[var(--hairline)] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#E8B15A]/70"
            />
            <button
              onClick={handleActivate}
              disabled={busy}
              className="px-4 py-2 rounded-lg u-pill-active disabled:opacity-50 text-sm font-semibold focus:outline-none"
            >
              Activate
            </button>
          </div>
        </div>
      )}

      {isPro && (
        <button
          onClick={handleDeactivate}
          disabled={busy}
          className="px-4 py-2 rounded-lg bg-red-600/20 text-red-300 border border-red-500/30 hover:bg-red-600/30 disabled:opacity-50 text-sm font-semibold focus:outline-none"
        >
          Deactivate license
        </button>
      )}

      {status.msg && (
        <p className={`text-xs ${status.type === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>{status.msg}</p>
      )}

      {!window.desktop?.isElectron && (
        <p className="text-xs text-yellow-500 px-1">License activation is available in the desktop app only.</p>
      )}
    </div>
  );
}

function AdvancedSettings() {
  const activeSettings = useActiveSettings();
  const updateSettings = useProfilesStore((s) => s.updateSettings);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h3 className="text-lg font-semibold text-white mb-1">Advanced</h3>
        <p className="text-sm text-gray-400 mb-6">Power user and diagnostic settings.</p>
      </div>

      <div className="space-y-4">
        <TextFieldRow
          title="Custom User-Agent"
          subtitle="Sent with playlist, EPG and stream requests. Some providers require a specific player identity (e.g. VLC/3.0.20). Leave empty for the default."
          value={activeSettings?.customUserAgent || ''}
          placeholder="e.g. VLC/3.0.20 LibVLC/3.0.20"
          onSave={(v) => updateSettings({ customUserAgent: v })}
        />
        {!window.desktop?.isElectron && (
          <p className="text-xs text-yellow-500 px-1">
            Custom User-Agent takes effect in the desktop app only.
          </p>
        )}
      </div>
    </div>
  );
}

function AboutSettings() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h3 className="text-lg font-semibold text-white mb-1">About</h3>
        <p className="text-sm text-gray-400 mb-6">System information and versioning.</p>
      </div>

      <div className="p-6 bg-[#17171B] rounded-xl border border-[var(--hairline)] text-center">
        <div className="w-16 h-16 bg-[#E8B15A]/12 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-[#E8B15A]/25">
          <LucideMonitorPlay size={32} className="text-[#E8B15A]" />
        </div>
        <h4 className="text-xl font-bold text-white mb-1">Matrix IPTV</h4>
        <p className="text-gray-400 text-sm mb-6">Version 0.1.0-alpha</p>
        
        <div className="grid grid-cols-2 gap-4 text-left border-t border-[var(--hairline)] pt-6">
          <div>
            <div className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1">Electron</div>
            <div className="text-sm text-white">v31.7.7</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1">React</div>
            <div className="text-sm text-white">v18.3.1</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1">Platform</div>
            {/* `process` doesn't exist in the context-isolated renderer */}
            <div className="text-sm text-white capitalize">{navigator.userAgentData?.platform || navigator.platform || 'Unknown'}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1">Mode</div>
            <div className="text-sm text-white">{window.desktop?.isElectron ? 'Desktop' : 'Browser'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
