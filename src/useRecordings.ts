import { useState, useCallback, useEffect, useRef } from "react";

export interface RecordingFile {
  name: string;
  handle: FileSystemFileHandle;
  size: number;
  lastModified: number;
  duration: number | null;
}

function getVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.remove();
    };

    video.onloadedmetadata = () => {
      if (video.duration === Infinity || isNaN(video.duration)) {
        video.currentTime = Number.MAX_SAFE_INTEGER;
        video.ontimeupdate = () => {
          const dur = video.duration;
          cleanup();
          resolve(isFinite(dur) ? dur : null);
        };
      } else {
        const dur = video.duration;
        cleanup();
        resolve(dur);
      }
    };

    video.onerror = () => {
      cleanup();
      resolve(null);
    };

    video.src = url;
  });
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function useRecordings(
  getDirHandle: () => FileSystemDirectoryHandle | null,
  saveDirName: string | null,
) {
  const [recordings, setRecordings] = useState<RecordingFile[]>([]);
  const [loading, setLoading] = useState(false);
  const refreshCount = useRef(0);

  const refresh = useCallback(async () => {
    const dirHandle = getDirHandle();
    if (!dirHandle) {
      setRecordings([]);
      return;
    }

    setLoading(true);
    const thisRefresh = ++refreshCount.current;

    try {
      const files: RecordingFile[] = [];
      for await (const [name, handle] of (dirHandle as any).entries()) {
        if (handle.kind === "file" && name.endsWith(".webm")) {
          const file = await (handle as FileSystemFileHandle).getFile();
          files.push({
            name,
            handle: handle as FileSystemFileHandle,
            size: file.size,
            lastModified: file.lastModified,
            duration: null,
          });
        }
      }
      files.sort((a, b) => b.lastModified - a.lastModified);

      if (thisRefresh !== refreshCount.current) return;
      setRecordings(files);
    } finally {
      if (thisRefresh === refreshCount.current) {
        setLoading(false);
      }
    }
  }, [getDirHandle]);

  const loadDuration = useCallback(async (name: string) => {
    const dirHandle = getDirHandle();
    if (!dirHandle) return;

    try {
      const fileHandle = await dirHandle.getFileHandle(name);
      const file = await fileHandle.getFile();
      const duration = await getVideoDuration(file);

      setRecordings((prev) =>
        prev.map((r) => (r.name === name ? { ...r, duration } : r)),
      );
    } catch {
      // File may have been deleted
    }
  }, [getDirHandle]);

  const deleteRecording = useCallback(async (name: string) => {
    const dirHandle = getDirHandle();
    if (!dirHandle) return;

    try {
      await (dirHandle as any).removeEntry(name);
      setRecordings((prev) => prev.filter((r) => r.name !== name));
    } catch (e) {
      console.error("Failed to delete recording:", e);
    }
  }, [getDirHandle]);

  // Auto-refresh when directory changes
  useEffect(() => {
    if (saveDirName) refresh();
  }, [saveDirName, refresh]);

  return {
    recordings,
    loading,
    refresh,
    loadDuration,
    deleteRecording,
  };
}
