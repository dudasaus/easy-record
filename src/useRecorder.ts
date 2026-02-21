import { useRef, useState, useCallback } from "react";

export type RecordingState = "idle" | "previewing" | "recording" | "paused";

export function useRecorder() {
  const [state, setState] = useState<RecordingState>("idle");
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number>(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);

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

  const startCapture = useCallback(async () => {
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
    } catch (e) {
      if (e instanceof DOMException && e.name === "NotAllowedError") {
        // User cancelled the picker, not an error
        return;
      }
      setError("Failed to start screen capture");
      console.error(e);
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

    recorder.start(1000); // collect data every second
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
      // Resume timer from current duration
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

    // Try File System Access API first
    if ("showSaveFilePicker" in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: filename,
          types: [
            {
              description: "WebM Video",
              accept: { "video/webm": [".webm"] },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      } catch {
        // User cancelled or API failed, fall through to download
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
    videoRef,
    startCapture,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    cancelCapture,
  };
}
