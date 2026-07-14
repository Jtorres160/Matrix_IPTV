import React, { useState } from 'react';
import { useActiveSettings, useProfilesStore } from '../profileStore.js';
import ProfileSwitcher from '../ProfileSwitcher.jsx';
import { useAppStore } from '../store/appStore.js';
import { 
  LucideSettings, LucidePalette, LucideMonitorPlay, LucideDatabase, 
  LucideUsers, LucideTerminal, LucideInfo, LucideX, LucideChevronRight
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
      <div className="fixed right-0 top-0 bottom-0 w-[500px] bg-[#0c2a2d] border-l border-gray-700 shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700 bg-[#0a1f22]">
          <div className="flex items-center gap-3 text-white">
            <LucideSettings size={24} className="text-blue-400" />
            <h2 className="text-xl font-bold tracking-tight">Settings</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <LucideX size={20} />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex flex-1 overflow-hidden">
          
          {/* Sidebar */}
          <div className="w-48 bg-[#0a1f22]/50 border-r border-gray-700 p-4 space-y-1 overflow-y-auto">
            <SectionButton id="appearance" icon={<LucidePalette size={16} />} label="Appearance" active={activeSection === 'appearance'} onClick={setActiveSection} />
            <SectionButton id="playback" icon={<LucideMonitorPlay size={16} />} label="Playback" active={activeSection === 'playback'} onClick={setActiveSection} />
            <SectionButton id="sources" icon={<LucideDatabase size={16} />} label="Sources" active={activeSection === 'sources'} onClick={setActiveSection} />
            <SectionButton id="profiles" icon={<LucideUsers size={16} />} label="Profiles" active={activeSection === 'profiles'} onClick={setActiveSection} />
            <SectionButton id="advanced" icon={<LucideTerminal size={16} />} label="Advanced" active={activeSection === 'advanced'} onClick={setActiveSection} />
            <div className="my-4 border-t border-gray-700/50"></div>
            <SectionButton id="about" icon={<LucideInfo size={16} />} label="About" active={activeSection === 'about'} onClick={setActiveSection} />
          </div>

          {/* Settings Pane */}
          <div className="flex-1 p-6 overflow-y-auto">
            {activeSection === 'appearance' && <AppearanceSettings />}
            {activeSection === 'playback' && <PlaybackSettings />}
            {activeSection === 'sources' && <SourcesShortcut onClose={onClose} />}
            {activeSection === 'profiles' && <ProfilesSettings />}
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
          ? 'bg-blue-600 text-white shadow-md' 
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
        <div className="p-4 bg-[#123236] rounded-xl border border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="font-medium text-white">Application Theme</div>
              <div className="text-sm text-gray-400">Choose between light and dark modes</div>
            </div>
            <select
              value={darkMode ? "dark" : "light"}
              onChange={(e) => updateSettings({ theme: e.target.value })}
              className="bg-[#0a1f22] border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              ? 'bg-blue-900/20 border-blue-500' 
              : 'bg-[#123236] border-gray-700 hover:border-gray-500'
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
              ? 'bg-blue-900/20 border-blue-500' 
              : 'bg-[#123236] border-gray-700 hover:border-gray-500'
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
          className={`flex items-start gap-4 p-4 rounded-xl border cursor-not-allowed opacity-50 bg-[#123236] border-gray-700`}
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
      </div>
    </div>
  );
}

function SourcesShortcut({ onClose }) {
  const setCurrentView = useAppStore(s => s.setCurrentView);
  
  return (
    <div className="space-y-6 animate-in fade-in duration-300 h-full flex flex-col justify-center text-center px-4">
      <LucideDatabase size={48} className="mx-auto text-blue-400 mb-4 opacity-80" />
      <h3 className="text-xl font-bold text-white">Media Sources</h3>
      <p className="text-gray-400">
        Provider configuration is a primary workflow and has been moved to its own dedicated page.
      </p>
      <button 
        onClick={() => {
          setCurrentView('playlists');
          onClose();
        }}
        className="mt-6 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-all shadow-lg shadow-blue-900/20 mx-auto"
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
      <div className="p-4 bg-[#123236] rounded-xl border border-gray-700">
        <ProfileSwitcher />
      </div>
    </div>
  );
}

function AdvancedSettings() {
  const activeSettings = useActiveSettings();
  const updateSettings = useProfilesStore((s) => s.updateSettings);
  const autoRefresh = !!activeSettings?.autoRefresh;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h3 className="text-lg font-semibold text-white mb-1">Advanced</h3>
        <p className="text-sm text-gray-400 mb-6">Power user and diagnostic settings.</p>
      </div>

      <div className="p-4 bg-[#123236] rounded-xl border border-gray-700">
        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <div className="font-medium text-white">Auto-Refresh Providers</div>
            <div className="text-sm text-gray-400 mt-1">Automatically sync M3U and EPG data in the background</div>
          </div>
          <div className="relative">
            <input 
              type="checkbox" 
              className="sr-only peer"
              checked={autoRefresh}
              onChange={(e) => updateSettings({ autoRefresh: e.target.checked })}
            />
            <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
          </div>
        </label>
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

      <div className="p-6 bg-[#123236] rounded-xl border border-gray-700 text-center">
        <div className="w-16 h-16 bg-blue-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-blue-500/30">
          <LucideMonitorPlay size={32} className="text-blue-400" />
        </div>
        <h4 className="text-xl font-bold text-white mb-1">Matrix IPTV</h4>
        <p className="text-gray-400 text-sm mb-6">Version 0.1.0-alpha</p>
        
        <div className="grid grid-cols-2 gap-4 text-left border-t border-gray-700 pt-6">
          <div>
            <div className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1">Electron</div>
            <div className="text-sm text-white">v33.0.0</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1">React</div>
            <div className="text-sm text-white">v18.3.1</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1">Platform</div>
            <div className="text-sm text-white capitalize">{process.platform || 'Unknown'}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1">Architecture</div>
            <div className="text-sm text-white">{process.arch || 'Unknown'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
