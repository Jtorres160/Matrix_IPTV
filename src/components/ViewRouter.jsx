import React, { useRef } from 'react';
import LiveTVView from './LiveTVView.jsx';
import VODLibrary from './VODLibrary.jsx';
import ChannelBrowserView from './ChannelBrowserView.jsx';
import { useAppStore } from '../store/appStore';

import SourceManagerView from './SourceManagerView.jsx';

const ROUTES = {
  'live-tv': (props) => (
    <div className="w-full h-full bg-black/40 backdrop-blur-sm pl-0 md:pl-[260px] pb-16 md:pb-0 transition-all duration-300">
      <LiveTVView isActive={props.isActive} />
    </div>
  ),
  'channels': () => (
    <div className="w-full h-full bg-[#0a1214] pl-0 md:pl-[260px] pb-16 md:pb-0">
      <ChannelBrowserView />
    </div>
  ),
  'movies': (props) => (
    <div className="w-full h-full bg-[#0a1f22]/90 pl-0 md:pl-[260px] pb-16 md:pb-0 transition-all duration-300 overflow-y-auto">
      <VODLibrary type="movies" onPlayStream={(url) => props.onPlayStream(url, "Movie")} />
    </div>
  ),
  'series': (props) => (
    <div className="w-full h-full bg-[#0a1f22]/90 pl-0 md:pl-[260px] pb-16 md:pb-0 transition-all duration-300 overflow-y-auto">
      <VODLibrary type="series" onPlayStream={(url) => props.onPlayStream(url, "Series")} />
    </div>
  ),
  'playlists': (props) => (
    <div className="w-full h-full bg-[#0a1f22]/90 pl-0 md:pl-[260px] pb-16 md:pb-0 transition-all duration-300 overflow-y-auto">
      <SourceManagerView />
    </div>
  )
};

export default function ViewRouter({ onPlayStream }) {
  const currentView = useAppStore((s) => s.currentView);

  const lastViewRef = useRef(currentView === 'player' ? 'live-tv' : currentView);

  // Update the ref during render, not in an effect. An effect runs *after*
  // render, which made every navigation display the previous view (one-click
  // lag). The ref exists only to keep the last real view mounted while
  // currentView === 'player'.
  if (currentView !== 'player') {
    lastViewRef.current = currentView;
  }

  const activeRoute = lastViewRef.current;
  const RouteComponent = ROUTES[activeRoute];
  
  if (!RouteComponent) {
    return null;
  }

  const isActive = currentView !== 'player';

  return <RouteComponent onPlayStream={onPlayStream} isActive={isActive} />;
}
