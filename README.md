# Easy Record

A progressive web app for recording your screen, window, or browser tab and saving locally.

## Features

- **Screen, window, or tab capture** at 60 FPS with audio via the Screen Capture API
- **Recording controls** — record, pause/resume, stop with a live duration timer
- **Picture-in-Picture mode** — floating mini window with icon-only controls, toggleable live preview, and persistent size/visibility preferences
- **Local file saving** — pick a save directory once via the File System Access API; recordings write directly to disk as `.webm` files
- **Directory persistence** — chosen folder is remembered across sessions via IndexedDB with automatic permission re-requests
- **Post-recording review** — preview your recording and name it before saving, with overwrite warnings for existing files
- **Recordings library** — browse all saved recordings with file name, date, duration, and size; play inline or delete
- **Recent recordings widget** — last 3 recordings shown on the home screen for quick access
- **Toast notifications** — confirmation messages for save, delete, and discard actions
- **Installable PWA** — standalone app experience with service worker, offline support, and app icons
- **Dark theme** — minimal dark UI with indigo accents

## Tech

- React 19 + TypeScript + Vite
- `getDisplayMedia` + `MediaRecorder` (VP9/Opus in WebM)
- File System Access API (`showDirectoryPicker`, `FileSystemDirectoryHandle`)
- Document Picture-in-Picture API
- IndexedDB + localStorage for persistence
- `vite-plugin-pwa` for service worker and manifest

## Development

```
pnpm install
pnpm dev
```

## Build

```
pnpm build
pnpm preview
```
