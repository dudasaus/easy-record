import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useRecorder } from "./useRecorder";
import "./App.css";

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function App() {
  const {
    state,
    duration,
    error,
    videoRef,
    startCapture,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    cancelCapture,
  } = useRecorder();

  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const pipVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const hasPipSupport = "documentPictureInPicture" in window;
  const isActive = state !== "idle";

  // Keep track of the current stream so the PiP video can use it
  useEffect(() => {
    if (videoRef.current?.srcObject) {
      streamRef.current = videoRef.current.srcObject as MediaStream;
    } else {
      streamRef.current = null;
    }
  }, [state, videoRef]);

  // Sync stream to the PiP video element
  useEffect(() => {
    if (pipVideoRef.current && streamRef.current) {
      pipVideoRef.current.srcObject = streamRef.current;
    }
  });

  const togglePip = useCallback(async () => {
    if (pipWindow) {
      pipWindow.close();
      setPipWindow(null);
      return;
    }

    if (!hasPipSupport) return;

    try {
      const pip = await (window as any).documentPictureInPicture.requestWindow({
        width: 400,
        height: 300,
      });

      // Copy stylesheets into PiP window
      for (const sheet of document.styleSheets) {
        try {
          if (sheet.href) {
            const link = pip.document.createElement("link");
            link.rel = "stylesheet";
            link.href = sheet.href;
            pip.document.head.appendChild(link);
          } else {
            const style = pip.document.createElement("style");
            for (const rule of sheet.cssRules) {
              style.textContent += rule.cssText;
            }
            pip.document.head.appendChild(style);
          }
        } catch {
          // Skip cross-origin sheets
        }
      }

      pip.addEventListener("pagehide", () => {
        setPipWindow(null);
      });

      setPipWindow(pip);
    } catch (e) {
      console.error("PiP failed:", e);
    }
  }, [pipWindow, hasPipSupport]);

  // Close PiP when recording stops
  useEffect(() => {
    if (state === "idle" && pipWindow) {
      pipWindow.close();
      setPipWindow(null);
    }
  }, [state, pipWindow]);

  const controls = isActive && (
    <div className="controls">
      {(state === "recording" || state === "paused") && (
        <div className={`timer ${state === "recording" ? "recording" : ""}`}>
          <span className="rec-dot" />
          {formatTime(duration)}
        </div>
      )}

      <div className="btn-group">
        {state === "previewing" && (
          <>
            <button className="btn btn-record" onClick={startRecording}>
              <span className="rec-icon" />
              Record
            </button>
            <button className="btn btn-secondary" onClick={cancelCapture}>
              Cancel
            </button>
          </>
        )}

        {state === "recording" && (
          <>
            <button className="btn btn-secondary" onClick={pauseRecording}>
              Pause
            </button>
            <button className="btn btn-stop" onClick={stopRecording}>
              <span className="stop-icon" />
              Stop & Save
            </button>
          </>
        )}

        {state === "paused" && (
          <>
            <button className="btn btn-primary" onClick={resumeRecording}>
              Resume
            </button>
            <button className="btn btn-stop" onClick={stopRecording}>
              <span className="stop-icon" />
              Stop & Save
            </button>
          </>
        )}
      </div>

      {hasPipSupport && !pipWindow && (
        <button className="btn btn-icon" onClick={togglePip} title="Picture in Picture">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <rect x="12" y="9" width="8" height="6" rx="1" fill="currentColor" opacity="0.3" />
          </svg>
        </button>
      )}
    </div>
  );

  const pipContent = pipWindow && (
    <div className="preview-container active pip-mode">
      <video ref={pipVideoRef} autoPlay muted playsInline />
      {controls}
    </div>
  );

  return (
    <div className="app">
      <header className="header">
        <h1>Easy Record</h1>
        <p className="subtitle">Screen, window, or tab recorder</p>
      </header>

      {error && <div className="error">{error}</div>}

      {!isActive && (
        <div className="start-section">
          <button className="btn btn-primary btn-lg" onClick={startCapture}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            Select Source
          </button>
          <p className="hint">Choose a screen, window, or browser tab to record</p>
        </div>
      )}

      {/* Main window preview — hidden when PiP is active */}
      {!pipWindow && (
        <div className={`preview-container ${isActive ? "active" : ""}`}>
          <video ref={videoRef} autoPlay muted playsInline />
          {controls}
        </div>
      )}

      {/* When PiP is active, show a placeholder in main window */}
      {pipWindow && isActive && (
        <div className="pip-placeholder">
          <p>Playing in Picture-in-Picture</p>
          <button className="btn btn-secondary" onClick={togglePip}>
            Return to window
          </button>
        </div>
      )}

      {/* Portal controls + video into PiP window */}
      {pipWindow && createPortal(pipContent, pipWindow.document.body)}
    </div>
  );
}

export default App;
