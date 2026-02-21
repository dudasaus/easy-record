import { useRef, useState, useCallback, useEffect } from "react";

export type RecordingState = "idle" | "previewing" | "recording" | "paused";

const DB_NAME = "easy-record";
const STORE_NAME = "settings";
const DIR_KEY = "saveDir";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function storeDirHandle(handle: FileSystemDirectoryHandle) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).put(handle, DIR_KEY);
  db.close();
}

async function loadDirHandle(): Promise<FileSystemDirectoryHandle | null> {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(DIR_KEY);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => resolve(null);
    db.close();
  });
}

export function useRecorder() {
  const [state, setState] = useState<RecordingState>("idle");
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saveDirName, setSaveDirName] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number>(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const dirHandleRef = useRef<FileSystemDirectoryHandle | null>(null);

  // Restore saved directory handle on mount
  useEffect(() => {
    loadDirHandle().then(async (handle) => {
      if (!handle) return;
      // Verify we still have permission (don't prompt yet, just check)
      const perm = await (handle as any).queryPermission({ mode: "readwrite" });
      if (perm === "granted") {
        dirHandleRef.current = handle;
        setSaveDirName(handle.name);
      } else {
        // Store the handle so we can request permission on user gesture
        dirHandleRef.current = handle;
        setSaveDirName(handle.name);
      }
    });
  }, []);

  const startTimer = useCallback(() => {
    setDuration(0);
    const start = Date.now();
    timerRef.current = window.setInterval(() => {
      setDuration(Math.floor((Date.now() - start) / 1000));
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    clearInterval(timerRef.current);
  }, []);

  const pickDirectory = useCallback(async (): Promise<boolean> => {
    if (!("showDirectoryPicker" in window)) return false;
    try {
      const handle = await (window as any).showDirectoryPicker({
        mode: "readwrite",
        startIn: "videos",
      });
      dirHandleRef.current = handle;
      setSaveDirName(handle.name);
      await storeDirHandle(handle);
      return true;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        return false;
      }
      console.error("Directory picker failed:", e);
      return false;
    }
  }, []);

  const clearDirectory = useCallback(async () => {
    dirHandleRef.current = null;
    setSaveDirName(null);
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(DIR_KEY);
    db.close();
  }, []);

  // Re-request permission for a stored handle (needs user gesture)
  const ensureDirPermission = useCallback(async (): Promise<boolean> => {
    const handle = dirHandleRef.current;
    if (!handle) return false;
    const perm = await (handle as any).queryPermission({ mode: "readwrite" });
    if (perm === "granted") return true;
    const req = await (handle as any).requestPermission({ mode: "readwrite" });
    return req === "granted";
  }, []);

  const startCapture = useCallback(async (): Promise<boolean> => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 60 },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // If user stops sharing via browser UI, clean up
      stream.getVideoTracks()[0].addEventListener("ended", () => {
        stopRecording();
      });

      setState("previewing");
      return true;
    } catch (e) {
      if (e instanceof DOMException && e.name === "NotAllowedError") {
        return false;
      }
      setError("Failed to start screen capture");
      console.error(e);
      return false;
    }
  }, []);

  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;

    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : "video/webm";

    const recorder = new MediaRecorder(stream, { mimeType });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      saveRecording();
    };

    recorder.start(1000);
    recorderRef.current = recorder;
    setState("recording");
    startTimer();
  }, [startTimer]);

  const pauseRecording = useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.pause();
      setState("paused");
      stopTimer();
    }
  }, [stopTimer]);

  const resumeRecording = useCallback(() => {
    if (recorderRef.current?.state === "paused") {
      recorderRef.current.resume();
      setState("recording");
      const offset = duration;
      const start = Date.now();
      timerRef.current = window.setInterval(() => {
        setDuration(offset + Math.floor((Date.now() - start) / 1000));
      }, 1000);
    }
  }, [duration]);

  const stopRecording = useCallback(() => {
    stopTimer();
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setState("idle");
    setDuration(0);
  }, [stopTimer]);

  const cancelCapture = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setState("idle");
  }, []);

  const saveRecording = useCallback(async () => {
    const blob = new Blob(chunksRef.current, { type: "video/webm" });
    chunksRef.current = [];
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `recording-${timestamp}.webm`;

    // Write directly to chosen directory if we have a handle
    if (dirHandleRef.current) {
      try {
        const fileHandle = await dirHandleRef.current.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      } catch (e) {
        console.error("Failed to save to directory:", e);
        // Fall through to download
      }
    }

    // Fallback: trigger download
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  return {
    state,
    duration,
    error,
    saveDirName,
    videoRef,
    pickDirectory,
    clearDirectory,
    ensureDirPermission,
    startCapture,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    cancelCapture,
  };
}
