import { useState, useEffect, useCallback } from "react";
import type { RecordingFile } from "./useRecordings";
import { formatFileSize, formatDate, formatDuration } from "./useRecordings";

interface RecordingsViewProps {
  recordings: RecordingFile[];
  loading: boolean;
  onRefresh: () => void;
  onLoadDuration: (name: string) => void;
  onDelete: (name: string) => void;
}

export default function RecordingsView({
  recordings,
  loading,
  onRefresh,
  onLoadDuration,
  onDelete,
}: RecordingsViewProps) {
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const [playingName, setPlayingName] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Load durations for recordings that don't have them yet
  useEffect(() => {
    for (const rec of recordings) {
      if (rec.duration === null) {
        onLoadDuration(rec.name);
      }
    }
  }, [recordings, onLoadDuration]);

  const handlePlay = useCallback(async (rec: RecordingFile) => {
    if (playingUrl) URL.revokeObjectURL(playingUrl);

    if (playingName === rec.name) {
      setPlayingUrl(null);
      setPlayingName(null);
      return;
    }

    try {
      const file = await rec.handle.getFile();
      const url = URL.createObjectURL(file);
      setPlayingUrl(url);
      setPlayingName(rec.name);
    } catch (e) {
      console.error("Failed to play recording:", e);
    }
  }, [playingUrl, playingName]);

  const closePlayer = useCallback(() => {
    if (playingUrl) URL.revokeObjectURL(playingUrl);
    setPlayingUrl(null);
    setPlayingName(null);
  }, [playingUrl]);

  const handleDelete = useCallback((name: string) => {
    if (confirmDelete === name) {
      onDelete(name);
      setConfirmDelete(null);
      if (playingName === name) closePlayer();
    } else {
      setConfirmDelete(name);
    }
  }, [confirmDelete, onDelete, playingName, closePlayer]);

  // Clear confirm state when clicking elsewhere
  useEffect(() => {
    if (!confirmDelete) return;
    const timer = setTimeout(() => setConfirmDelete(null), 3000);
    return () => clearTimeout(timer);
  }, [confirmDelete]);

  // Cleanup playing URL on unmount
  useEffect(() => {
    return () => {
      if (playingUrl) URL.revokeObjectURL(playingUrl);
    };
  }, []);

  return (
    <div className="recordings-view">
      <div className="recordings-header">
        <h2>Recordings</h2>
        <button className="btn btn-icon" onClick={onRefresh} title="Refresh">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </button>
      </div>

      {playingUrl && (
        <div className="recording-player">
          <video src={playingUrl} controls autoPlay />
          <button className="btn btn-secondary recording-player-close" onClick={closePlayer}>
            Close
          </button>
        </div>
      )}

      {loading && recordings.length === 0 && (
        <div className="recordings-empty">Loading recordings...</div>
      )}

      {!loading && recordings.length === 0 && (
        <div className="recordings-empty">
          <p>No recordings yet</p>
          <p className="hint">Recordings you save will appear here</p>
        </div>
      )}

      {recordings.length > 0 && (
        <div className="recordings-list">
          {recordings.map((rec) => (
            <div
              key={rec.name}
              className={`recording-card ${playingName === rec.name ? "active" : ""}`}
            >
              <div className="recording-info" onClick={() => handlePlay(rec)}>
                <span className="recording-name">
                  {rec.name.replace(/\.webm$/, "")}
                </span>
                <div className="recording-meta">
                  <span>{formatDate(rec.lastModified)}</span>
                  <span>{rec.duration !== null ? formatDuration(rec.duration) : "..."}</span>
                  <span>{formatFileSize(rec.size)}</span>
                </div>
              </div>
              <div className="recording-actions">
                <button
                  className="btn btn-icon"
                  onClick={() => handlePlay(rec)}
                  title={playingName === rec.name ? "Close" : "Play"}
                >
                  {playingName === rec.name ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="6" y="4" width="4" height="16" />
                      <rect x="14" y="4" width="4" height="16" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="5,3 19,12 5,21" />
                    </svg>
                  )}
                </button>
<button
                  className={`btn btn-icon ${confirmDelete === rec.name ? "btn-stop" : ""}`}
                  onClick={() => handleDelete(rec.name)}
                  title={confirmDelete === rec.name ? "Confirm delete" : "Delete"}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
