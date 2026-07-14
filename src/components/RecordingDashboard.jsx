// src/components/RecordingDashboard.jsx
//
// TV-Friendly Recording Dashboard — Phase 5
//
// Architecture:
//   - RecordingCard is React.memo'd with a custom comparator to skip
//     re-renders when only unchanged telemetry is received.
//   - The grid uses CSS auto-fill for responsive card layout.
//   - All interactive elements carry data-nav-zone="recordings" and
//     data-nav-index={n} for the TV D-Pad navigation system.
//   - The onStop callback is ref-stabilized to prevent identity churn.
//   - Empty and error states are fully polished, not placeholders.

import React, { useState, useCallback, useRef, useMemo } from 'react';
import useRecordingTelemetry, {
  formatBytes,
  formatElapsedTime,
} from '../hooks/useRecordingTelemetry.js';

// ─── Status Configuration ───
const STATUS_CONFIG = {
  recording: {
    label: 'RECORDING',
    color: '#ef4444',
    bgColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: 'rgba(239, 68, 68, 0.4)',
    pulseClass: 'recording-pulse',
    icon: '🔴',
  },
  stopping: {
    label: 'STOPPING',
    color: '#f59e0b',
    bgColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: 'rgba(245, 158, 11, 0.4)',
    pulseClass: '',
    icon: '⏳',
  },
  paused: {
    label: 'PAUSED',
    color: '#3b82f6',
    bgColor: 'rgba(59, 130, 246, 0.15)',
    borderColor: 'rgba(59, 130, 246, 0.4)',
    pulseClass: '',
    icon: '⏸️',
  },
  idle: {
    label: 'COMPLETED',
    color: '#10b981',
    bgColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'rgba(16, 185, 129, 0.4)',
    pulseClass: '',
    icon: '✅',
  },
  error: {
    label: 'ERROR',
    color: '#f43f5e',
    bgColor: 'rgba(244, 63, 94, 0.15)',
    borderColor: 'rgba(244, 63, 94, 0.4)',
    pulseClass: '',
    icon: '⚠️',
  },
};

// ─── Inline Styles ───
const styles = {
  dashboard: {
    width: '100%',
    height: '100%',
    padding: '24px',
    boxSizing: 'border-box',
    backgroundColor: '#0a1118',
    color: '#e2e8f0',
    fontFamily: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
    overflowY: 'auto',
    overflowX: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '24px',
    paddingBottom: '16px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  headerIcon: {
    fontSize: '28px',
    lineHeight: 1,
  },
  headerTitle: {
    fontSize: '22px',
    fontWeight: 700,
    letterSpacing: '-0.025em',
    color: '#f1f5f9',
    margin: 0,
  },
  headerSubtitle: {
    fontSize: '13px',
    color: '#64748b',
    marginTop: '2px',
  },
  statsRow: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
  },
  statBadge: (color) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '0.02em',
    backgroundColor: `${color}22`,
    color: color,
    border: `1px solid ${color}44`,
  }),
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '16px',
    alignContent: 'start',
  },
  // Card
  card: (statusConfig, isFocused) => ({
    position: 'relative',
    backgroundColor: '#111827',
    borderRadius: '12px',
    border: `1px solid ${isFocused ? '#38bdf8' : statusConfig.borderColor}`,
    padding: '20px',
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    outline: 'none',
    cursor: 'pointer',
    boxShadow: isFocused
      ? '0 0 0 2px #38bdf8, 0 8px 32px rgba(56, 189, 248, 0.15)'
      : `0 4px 16px rgba(0, 0, 0, 0.3)`,
    transform: isFocused ? 'scale(1.02)' : 'scale(1)',
    overflow: 'hidden',
  }),
  cardGlow: (color) => ({
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '3px',
    background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
    borderRadius: '12px 12px 0 0',
  }),
  cardHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: '16px',
  },
  channelName: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#f1f5f9',
    lineHeight: 1.3,
    maxWidth: '200px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  statusBadge: (config) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    padding: '3px 10px',
    borderRadius: '6px',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    backgroundColor: config.bgColor,
    color: config.color,
    border: `1px solid ${config.borderColor}`,
    flexShrink: 0,
  }),
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
    marginBottom: '16px',
  },
  metricBox: {
    padding: '10px 12px',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.06)',
  },
  metricLabel: {
    fontSize: '10px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#64748b',
    marginBottom: '4px',
  },
  metricValue: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#e2e8f0',
    fontVariantNumeric: 'tabular-nums',
  },
  // Progress bar
  progressContainer: {
    marginBottom: '16px',
  },
  progressTrack: {
    width: '100%',
    height: '4px',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: '2px',
    overflow: 'hidden',
    position: 'relative',
  },
  progressFill: (color, width) => ({
    height: '100%',
    width: `${Math.min(width, 100)}%`,
    backgroundColor: color,
    borderRadius: '2px',
    transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
    position: 'relative',
  }),
  progressShimmer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
    animation: 'shimmer 2s infinite',
  },
  // File path
  filePath: {
    fontSize: '11px',
    color: '#475569',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    marginBottom: '12px',
    padding: '6px 8px',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: '4px',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
    letterSpacing: '-0.01em',
  },
  // Error message
  errorMessage: {
    fontSize: '12px',
    color: '#f43f5e',
    padding: '8px 10px',
    backgroundColor: 'rgba(244, 63, 94, 0.1)',
    borderRadius: '6px',
    marginBottom: '12px',
    border: '1px solid rgba(244, 63, 94, 0.2)',
  },
  // Buttons
  actionRow: {
    display: 'flex',
    gap: '8px',
    marginTop: '4px',
  },
  stopButton: (isFocused) => ({
    flex: 1,
    padding: '8px 16px',
    borderRadius: '8px',
    border: isFocused ? '2px solid #38bdf8' : '1px solid rgba(239, 68, 68, 0.4)',
    backgroundColor: isFocused ? 'rgba(239, 68, 68, 0.25)' : 'rgba(239, 68, 68, 0.12)',
    color: '#fca5a5',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    outline: 'none',
    textAlign: 'center',
    letterSpacing: '0.02em',
  }),
  dismissButton: (isFocused) => ({
    flex: 1,
    padding: '8px 16px',
    borderRadius: '8px',
    border: isFocused ? '2px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
    backgroundColor: isFocused ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.05)',
    color: '#94a3b8',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    outline: 'none',
    textAlign: 'center',
  }),
  // Empty state
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '400px',
    textAlign: 'center',
    padding: '48px 24px',
  },
  emptyIcon: {
    fontSize: '64px',
    marginBottom: '24px',
    opacity: 0.4,
    filter: 'grayscale(0.5)',
  },
  emptyTitle: {
    fontSize: '20px',
    fontWeight: 700,
    color: '#94a3b8',
    marginBottom: '8px',
  },
  emptySubtitle: {
    fontSize: '14px',
    color: '#475569',
    maxWidth: '360px',
    lineHeight: 1.6,
  },
  emptyPulseRing: {
    width: '120px',
    height: '120px',
    borderRadius: '50%',
    border: '2px solid rgba(100, 116, 139, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '24px',
    position: 'relative',
  },
};

// ─── Keyframe Injection (runs once) ───
let stylesInjected = false;
function injectKeyframes() {
  if (stylesInjected) return;
  stylesInjected = true;

  const sheet = document.createElement('style');
  sheet.textContent = `
    @keyframes shimmer {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(100%); }
    }
    @keyframes recording-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    @keyframes empty-ring-pulse {
      0%, 100% { transform: scale(1); opacity: 0.3; }
      50% { transform: scale(1.08); opacity: 0.6; }
    }
    @keyframes fade-in-up {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .recording-pulse {
      animation: recording-pulse 1.5s ease-in-out infinite;
    }
    .card-enter {
      animation: fade-in-up 0.35s cubic-bezier(0.4, 0, 0.2, 1) both;
    }
    .empty-ring-pulse {
      animation: empty-ring-pulse 3s ease-in-out infinite;
    }
    .recording-card:hover {
      transform: scale(1.02) !important;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4) !important;
    }
    .recording-card:focus-visible {
      outline: 2px solid #38bdf8;
      outline-offset: 2px;
    }
    .stop-btn:hover {
      background-color: rgba(239, 68, 68, 0.3) !important;
      border-color: rgba(239, 68, 68, 0.6) !important;
      color: #fecaca !important;
    }
    .dismiss-btn:hover {
      background-color: rgba(255, 255, 255, 0.12) !important;
      color: #cbd5e1 !important;
    }
  `;
  document.head.appendChild(sheet);
}

// ─── Recording Card (Memoized) ───
const RecordingCard = React.memo(function RecordingCard({
  streamId,
  name,
  bytesWritten,
  elapsedMs,
  filePath,
  status,
  error,
  navIndex,
  onStop,
  onDismiss,
}) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.idle;
  const [isFocused, setIsFocused] = useState(false);
  const isActive = status === 'recording' || status === 'paused';
  const isStopping = status === 'stopping';

  // Progress bar: use a time-based cycling pattern for live streams
  // (since we don't know total duration/size, we animate a repeating fill)
  const progressWidth = useMemo(() => {
    if (status === 'idle') return 100;
    if (status === 'error') return 100;
    if (status === 'stopping') return 85;
    // Cycle the progress bar for active recordings based on elapsed seconds
    const seconds = Math.floor((elapsedMs || 0) / 1000);
    return 20 + (seconds % 60) * (80 / 60);
  }, [status, elapsedMs]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (isActive && onStop) {
          onStop(streamId);
        } else if ((status === 'idle' || status === 'error') && onDismiss) {
          onDismiss(streamId);
        }
      }
    },
    [streamId, isActive, status, onStop, onDismiss]
  );

  return (
    <div
      className={`recording-card card-enter`}
      style={styles.card(config, isFocused)}
      data-nav-zone="recordings"
      data-nav-index={navIndex}
      tabIndex={0}
      role="article"
      aria-label={`Recording: ${name}, Status: ${config.label}`}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onKeyDown={handleKeyDown}
    >
      {/* Top glow accent */}
      <div style={styles.cardGlow(config.color)} />

      {/* Header: Name + Status Badge */}
      <div style={styles.cardHeader}>
        <div style={styles.channelName} title={name}>
          {name}
        </div>
        <div
          style={styles.statusBadge(config)}
          className={config.pulseClass}
        >
          <span>{config.icon}</span>
          <span>{config.label}</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div style={styles.progressContainer}>
        <div style={styles.progressTrack}>
          <div style={styles.progressFill(config.color, progressWidth)}>
            {isActive && <div style={styles.progressShimmer} />}
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div style={styles.metricsGrid}>
        <div style={styles.metricBox}>
          <div style={styles.metricLabel}>Size Written</div>
          <div style={styles.metricValue}>{formatBytes(bytesWritten)}</div>
        </div>
        <div style={styles.metricBox}>
          <div style={styles.metricLabel}>Duration</div>
          <div style={styles.metricValue}>{formatElapsedTime(elapsedMs)}</div>
        </div>
      </div>

      {/* File Path */}
      {filePath && (
        <div style={styles.filePath} title={filePath}>
          📁 {filePath}
        </div>
      )}

      {/* Error Message */}
      {status === 'error' && error && (
        <div style={styles.errorMessage}>
          ⚠️ {error}
        </div>
      )}

      {/* Action Buttons */}
      <div style={styles.actionRow}>
        {isActive && (
          <button
            className="stop-btn"
            style={styles.stopButton(false)}
            data-nav-zone="recordings"
            data-nav-index={navIndex}
            onClick={(e) => {
              e.stopPropagation();
              onStop?.(streamId);
            }}
            disabled={isStopping}
            aria-label={`Stop recording ${name}`}
          >
            ⏹ Stop Recording
          </button>
        )}
        {isStopping && (
          <button
            style={styles.dismissButton(false)}
            disabled
            aria-label="Stopping recording"
          >
            ⏳ Stopping...
          </button>
        )}
        {status === 'idle' && (
          <button
            className="dismiss-btn"
            style={styles.dismissButton(false)}
            data-nav-zone="recordings"
            data-nav-index={navIndex}
            onClick={(e) => {
              e.stopPropagation();
              onDismiss?.(streamId);
            }}
            aria-label={`Dismiss completed recording ${name}`}
          >
            ✓ Dismiss
          </button>
        )}
        {status === 'error' && (
          <button
            className="dismiss-btn"
            style={styles.dismissButton(false)}
            data-nav-zone="recordings"
            data-nav-index={navIndex}
            onClick={(e) => {
              e.stopPropagation();
              onDismiss?.(streamId);
            }}
            aria-label={`Dismiss errored recording ${name}`}
          >
            ✕ Dismiss
          </button>
        )}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparator: only re-render if telemetry or status actually changed
  return (
    prevProps.bytesWritten === nextProps.bytesWritten &&
    prevProps.elapsedMs === nextProps.elapsedMs &&
    prevProps.status === nextProps.status &&
    prevProps.error === nextProps.error &&
    prevProps.navIndex === nextProps.navIndex &&
    prevProps.name === nextProps.name &&
    prevProps.filePath === nextProps.filePath
  );
});

// ─── Empty State Component ───
function EmptyState() {
  return (
    <div style={styles.emptyState}>
      <div className="empty-ring-pulse" style={styles.emptyPulseRing}>
        <span style={styles.emptyIcon}>📡</span>
      </div>
      <div style={styles.emptyTitle}>No Active Recordings</div>
      <div style={styles.emptySubtitle}>
        Start recording a live stream from the channel list. Active and
        completed recordings will appear here with real-time telemetry.
      </div>
    </div>
  );
}

// ─── Main Dashboard Component ───
export default function RecordingDashboard() {
  // Inject CSS keyframes once
  React.useEffect(() => {
    injectKeyframes();
  }, []);

  const {
    recordings,
    stopRecording,
    dismissRecording,
    activeCount,
    errorCount,
    totalCount,
  } = useRecordingTelemetry();

  // Ref-stabilized callbacks to prevent identity churn on the memoized cards
  const stopRef = useRef(stopRecording);
  stopRef.current = stopRecording;
  const handleStop = useCallback((streamId) => {
    stopRef.current(streamId);
  }, []);

  const dismissRef = useRef(dismissRecording);
  dismissRef.current = dismissRecording;
  const handleDismiss = useCallback((streamId) => {
    dismissRef.current(streamId);
  }, []);

  // Sort recordings: active first, then errors, then completed
  const sortedEntries = useMemo(() => {
    const statusOrder = { recording: 0, paused: 1, stopping: 2, error: 3, idle: 4 };
    return Object.entries(recordings).sort(([, a], [, b]) => {
      const orderA = statusOrder[a.status] ?? 5;
      const orderB = statusOrder[b.status] ?? 5;
      return orderA - orderB;
    });
  }, [recordings]);

  const isEmpty = totalCount === 0;

  return (
    <div style={styles.dashboard}>
      {/* Dashboard Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.headerIcon}>⏺</span>
          <div>
            <h1 style={styles.headerTitle}>Recording Dashboard</h1>
            <div style={styles.headerSubtitle}>
              {isEmpty
                ? 'Monitor live stream recordings'
                : `${totalCount} recording${totalCount !== 1 ? 's' : ''} tracked`}
            </div>
          </div>
        </div>
        {!isEmpty && (
          <div style={styles.statsRow}>
            {activeCount > 0 && (
              <span style={styles.statBadge('#ef4444')}>
                <span className="recording-pulse">●</span>
                {activeCount} Active
              </span>
            )}
            {errorCount > 0 && (
              <span style={styles.statBadge('#f43f5e')}>
                ⚠ {errorCount} Error{errorCount !== 1 ? 's' : ''}
              </span>
            )}
            {totalCount - activeCount - errorCount > 0 && (
              <span style={styles.statBadge('#10b981')}>
                ✓ {totalCount - activeCount - errorCount} Done
              </span>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      {isEmpty ? (
        <EmptyState />
      ) : (
        <div style={styles.grid} role="list" aria-label="Active recordings">
          {sortedEntries.map(([streamId, data], index) => (
            <RecordingCard
              key={streamId}
              streamId={streamId}
              name={data.name}
              bytesWritten={data.bytesWritten}
              elapsedMs={data.elapsedMs}
              filePath={data.filePath}
              status={data.status}
              error={data.error}
              navIndex={index}
              onStop={handleStop}
              onDismiss={handleDismiss}
            />
          ))}
        </div>
      )}
    </div>
  );
}
