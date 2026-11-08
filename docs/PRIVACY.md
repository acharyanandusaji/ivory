# Privacy

Ivory is designed as a **local-first** application. It has no server component, no user accounts, no analytics, and no remote inference. This document describes exactly what is stored, where it goes, and how to remove it.

## Data flow

```
File picker / drag-and-drop / ZIP
        │
        ▼
Browser memory ──► content hash + EXIF ──► IndexedDB (project, photo, original/preview/thumb)
        │
        ├──► Analysis worker ──► quality scores, flags, dHash ──► IndexedDB
        ├──► Face worker ──────► faces, crops, descriptors ─────► IndexedDB (only with consent)
        └──► CLIP worker ──────► 512-d embeddings ──────────────► IndexedDB (only with consent)
```

Nothing in that diagram leaves the device.

## What is stored

| Store | Contents |
| --- | --- |
| `projects` | Library name, event details, privacy consent flags, analysis thresholds and appearance preferences |
| `photos` | Filename, dimensions, capture time, camera metadata, content hash, dHash, scores, flags, tags, ratings, notes, selection state |
| `assets` | Optional original file, preview, thumbnail and face-crop blobs |
| `faces` | Face boxes, smile/eyes/gaze estimates, quality values and 128-d recognition descriptors |
| `people` | Cluster names, roles, cover face and centroid descriptors |
| `groups` | Exact-duplicate, visual-similarity and burst sets |
| `events` | Capture-time moments derived from gaps in the timeline |
| `embeddings` | Optional 512-d CLIP image embeddings |

Project data lives in the IndexedDB database `ivory-studio` under the app's origin. Object URLs used to display images are temporary and revoked by an in-memory LRU.

## Network requests

Ivory makes **no requests to a backend it controls**. The only network activity is:

1. **Loading the app and its bundled assets** from the static host that serves Ivory (HTML, JavaScript, CSS, fonts, icons, face models and ONNX Runtime WASM files).
2. **The optional CLIP model**, fetched from the Hugging Face CDN (`huggingface.co` / `cdn-lfs.huggingface.co`) the first time you enable **Natural-language visual search** and confirm the download. The quantised model is roughly 170 MB. It is cached by the service worker and is not requested again while the cache remains.
3. Normal browser behaviour such as service-worker updates, initiated by the browser.

No photograph, thumbnail, face descriptor, embedding, project name, note or usage event is included in any request. There is no telemetry endpoint to send it to.

## Consent

Two features are opt-in and independently controlled:

| Feature | Default | What it stores | How to remove |
| --- | --- | --- | --- |
| Face detection and People | Off for new libraries; enable in Settings | Face boxes, crops, descriptors and people clusters | **Settings → Delete face data** |
| Natural-language visual search (CLIP) | Off | Image embeddings and the cached CLIP model | **Settings → Delete visual index**; clear site data to remove the model cache |

Imported photographs are never sent anywhere, with or without consent. Turning a feature off stops future processing but does not automatically delete existing data — use the deletion controls.

## Deletion

- **Delete face data** removes face rows, crops, people and their centroids. Photographs, ratings and album selections are untouched.
- **Delete visual index** removes all CLIP embeddings. The downloaded model remains cached until site data is cleared.
- **Delete stored originals** frees the largest blobs but keeps previews and analysis. Re-import or relink originals from **Export & handoff** when needed.
- **Delete this library** removes the project and all of its photographs, assets, faces, people, groups, events and embeddings.
- **Reset all Ivory data** clears the entire `ivory-studio` database. Use it before handing a device to someone else.

Clearing site data in the browser, using a private window, or uninstalling the PWA can also remove local data. Ivory cannot recover it.

## Security and shared devices

- The app is served over HTTPS (or `localhost`) and runs in the browser's same-origin sandbox.
- Face models and ONNX Runtime files are served from the same origin. Ivory does not execute remote code from the CLIP repository; `@huggingface/transformers` loads model weights and runs them locally.
- Anyone with access to the same browser profile and origin may be able to read the library. Use a dedicated OS/browser profile for sensitive work, and delete the library or reset Ivory before transferring a device.
- Exported files (ZIP, PDF, CSV, HTML) are ordinary local files and are no longer protected by the app.

## Backups

Browser storage is convenient, not archival. Browsers may evict data under storage pressure, and users can clear it accidentally. Ivory offers **Settings → Protect local data** to request persistent storage, but this is not a backup. Always keep independent backups of original photographs, and export a ZIP of the originals after a session.

## Contact and changes

This document describes the behaviour of the source in this repository. If you modify Ivory, review this file and update it to match your deployment. There is no data controller or processor relationship because the application does not transmit personal data to the project maintainers.
