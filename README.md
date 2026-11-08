# Ivory

**Private, local-first AI photo curation for weddings and events.**

Ivory helps photographers and couples turn thousands of photographs into a calm, well-ordered album. It groups duplicates and bursts, ranks quality, finds recurring people, supports smart search and side-by-side comparison, and exports a finished handoff — without uploading a single photograph.

- **100% local by default.** Images, face descriptors and search embeddings live in your browser's IndexedDB.
- **No accounts, subscriptions, paid APIs or cloud inference.** The face models ship with the app; the optional visual-search model is downloaded once, only after you consent.
- **AI recommends, you decide.** Ivory never deletes, rejects or discards a photograph automatically. Every suggestion can be overridden.
- **Free and open source.** Application code is MIT licensed; every dependency and model uses a permissive licence.

---

## Highlights

| Area | What Ivory does |
| --- | --- |
| Import | Drag and drop files, folders or ZIP archives; streamed ZIP reading; EXIF capture dates; content-hash duplicate detection; resumable background analysis |
| Grouping | Exact duplicates, visual near-duplicates (64-bit dHash + LSH), and time-based burst detection with a suggested best frame |
| Quality | Focus, exposure, composition, resolution and face quality scores; blur, clipping, low-resolution and closed-eye flags; library-relative ranking |
| People | On-device face detection, smile/eyes/gaze estimates, incremental clustering, rename, merge, roles and cover-photo selection; face data can be erased independently |
| Library | Timeline, quality and filename sorting, favourites, rejected frames, ratings, notes, bulk selection, undo and keyboard-first lightbox |
| Search | Metadata and keyword search with natural-language parsing (people, roles, tags, flags, months, years) and optional CLIP visual search |
| Compare | Up to four photographs with synchronised zoom and pan, a shared rule-of-thirds overlay and quality readouts |
| Album | Target-count curation, coverage of key people and moments, category grouping, manual overrides and a print-accurate spread preview |
| Export | Original-resolution ZIP (with category folders and filename templates), CSV, JSON manifest, contact-sheet PDF, album PDF, report PDF and a shareable handoff sheet |
| Handoff | Relink originals after moving machines, review export summaries and prepare studio delivery notes |
| Privacy | Explicit face/visual-search consent, storage breakdown, independent deletion of faces, embeddings or originals, full project reset |

---

## Quick start

Requirements: **Node.js 20+** and a Chromium-based browser for the full experience.

```bash
npm install
npm run dev        # development server
npm run build      # type-check + production build
npm run preview    # serve the production build
npm run test       # Vitest suite
npm run typecheck  # TypeScript only
```

The production build is a static site. Upload the contents of `dist/` to any static host (GitHub Pages, Netlify, Cloudflare Pages, an S3 bucket, or a local folder). The app uses relative asset paths, so it works from a subdirectory. Once the app and its models have loaded, it is installable as a PWA and works offline.

### Host on GitHub Pages

The repository includes a workflow that tests, builds and deploys the app to GitHub Pages.

1. Push the repository to GitHub with the default branch named `main`.
2. In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Push to `main` (or run **Actions → Deploy to GitHub Pages → Run workflow**).
4. The site is published at `https://<user>.github.io/<repo>/`.

The build uses relative asset paths and a hash router, so it works from a project subdirectory without extra configuration. `public/.nojekyll` keeps GitHub Pages from filtering build assets. All processing still happens in the visitor's browser; GitHub only serves the static files.

### First run

1. **Create a library.** Give the wedding or event a name. You can add venue, couple and photographer details later.
2. **Import.** Drop files, a folder or ZIP archives. Analysis starts automatically and continues while you browse other pages.
3. **Review.** Use Review for duplicate and burst sets; Library for the full collection; People to name recurring faces.
4. **Curate.** Choose an album target, let Ivory suggest a selection, then adjust categories and selections by hand.
5. **Deliver.** Preview spreads and export originals, contact sheets, PDFs, metadata and a handoff report.

> **Keep a backup of your originals.** Ivory stores originals in browser storage when enabled, but browser storage is not a substitute for a proper photo backup.

---

## Privacy

Ivory has no backend. There is no telemetry, analytics, account system or remote inference.

- **Face models are bundled** in `public/models` and served from the same origin.
- **The optional CLIP model** (`Xenova/clip-vit-base-patch32`, ~170 MB) is fetched from the Hugging Face CDN **only** after you explicitly enable natural-language visual search. It is then cached by the service worker for offline use.
- **Everything else stays on the device.** Imported files, thumbnails, face crops, descriptors, embeddings and project metadata are stored in IndexedDB.
- **Consent is granular.** Face detection and visual search are separate switches. Either data set can be deleted without touching the photographs.
- **Nothing is deleted automatically.** Rejected frames remain until you explicitly delete a project or reset Ivory.

See [docs/PRIVACY.md](docs/PRIVACY.md) for the full data-flow and retention description.

---

## How the AI works

All models run in Web Workers with TensorFlow.js or ONNX Runtime Web.

- **Quality scoring** is deterministic image analysis: Laplacian variance, Tenengrad, edge density, luminance distribution, clipping, contrast, saturation, saliency and composition heuristics, combined with face signals.
- **Similarity grouping** uses a 64-bit difference hash (dHash). An LSH banding scheme guarantees candidate discovery for Hamming distance ≤ 8; groups are confirmed with an exact distance check and aspect-ratio guard.
- **Bursts** are runs of frames from the same camera within a configurable capture window.
- **Faces** use the Tiny Face Detector or SSD MobileNet, 68-point landmarks, expression and recognition networks from `@vladmandic/face-api`. Descriptors are clustered incrementally; unnamed people can be regrouped, merged or renamed.
- **Semantic search** optionally embeds each preview with CLIP and compares text and image embeddings with cosine similarity.

Ivory deliberately avoids unreliable event classifiers. Album categories are explainable heuristics based on face count, named roles, event type, capture time and user overrides.

---

## Browser support and limits

| Capability | Notes |
| --- | --- |
| Chromium (Chrome, Edge, Brave, Arc) | Recommended. Full support, including File System Access save dialogs and WebGL face inference. |
| Firefox / Safari | Core import, curation and export work. Large ZIP exports fall back to a browser download; face inference may use the CPU backend and run more slowly. |
| HEIC/HEIF | Not decoded by browsers. Convert to JPEG before importing. |
| ZIP import | Up to 30,000 files / 30 GB / 10 minutes per archive; streamed so memory stays bounded. |
| Library size | Designed for 5,000–10,000+ photographs, with incremental grid rendering. Very large libraries depend on available browser storage and memory. |
| Storage | Subject to the browser's quota (often a share of free disk). Use **Settings → Protect local data** to request persistent storage. |
| Offline | Assets, fonts and face models are precached. CLIP search becomes available offline after its one-time consented download. |

---

## Project structure

```
src/
  components/        shared UI, layout, photo grid, lightbox, filter rail
  hooks/             store selectors and derived library data
  lib/               pure domain logic + workers + persistence + exporters
    assets.ts        object-URL LRU and asset storage
    categories.ts    explainable album categories and smart filters
    clustering.ts    face descriptor clustering helpers
    db.ts            IndexedDB schema and repositories
    exporter.ts      ZIP, CSV, JSON, PDF and handoff exports
    grouping.ts      exact / visual / burst grouping
    import.ts        file, folder and streaming ZIP ingestion
    processor.ts     background analysis, faces, people, groups, events
    quality.ts       quality scoring, flags, tags and ranking
    search.ts        query parsing, keyword and semantic search
    selection.ts     album target curation and coverage
    visualSearch.ts  consented CLIP indexing and text search
  pages/             one route per workspace area
  store/             Zustand application store
  workers/           analysis, face, CLIP and ZIP workers
  test/              shared fixtures
public/
  models/            bundled face-api weights (MIT)
  ort/               ONNX Runtime Web WASM assets (MIT)
```

## Testing

```bash
npm run test
```

The Vitest suite covers grouping, quality scoring, clustering, selection, search, categories and export generation. Tests are pure Node tests and do not require a browser.

## Licence

Application code: **MIT** — see [LICENSE](LICENSE).

Third-party components retain their own licences. A complete inventory, including model weights and assets, is in [docs/THIRD-PARTY.md](docs/THIRD-PARTY.md).

## Acknowledgements

Ivory stands on the work of the open-source community: React, Vite, Tailwind CSS, Zustand, React Router, `idb`, `fflate`, `client-zip`, `exifr`, `jsPDF`, `hash-wasm`, Lucide, `@huggingface/transformers`, ONNX Runtime Web, `@vladmandic/face-api`, the face-api.js model authors, and the Xenova CLIP conversion. Please see the third-party inventory for details.
