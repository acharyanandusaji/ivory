# Third-party software and model licences

Ivory's own source is MIT licensed (see [../LICENSE](../LICENSE)). The following components are used under their respective permissive licences. All are free for personal and commercial use; none require a paid API, account or subscription.

## Runtime dependencies

| Component | Version | Licence | Used for |
| --- | --- | --- | --- |
| React / React DOM | 19 | MIT | UI runtime |
| React Router | 7 | MIT | Hash-based routing |
| Zustand | 5 | MIT | Client state |
| Vite | 6 | MIT | Development and build tooling |
| Tailwind CSS | 3 | MIT | Design system |
| `idb` | 8 | ISC | IndexedDB wrapper |
| `fflate` | 0.8 | MIT | ZIP reading/decompression |
| `client-zip` | 2.5 | MIT | Streaming ZIP creation |
| `exifr` | 7.1 | MIT | EXIF/metadata parsing |
| `jsPDF` | 4.2 | MIT | Contact-sheet, album and report PDFs |
| `hash-wasm` | 4.13 | MIT | Content hashing (BLAKE3) |
| `lucide-react` | 0.468 | ISC | Icons |
| `clsx` | 2.1 | MIT | Class-name composition |
| `@vladmandic/face-api` | 1.7.15 | MIT | Face detection, landmarks, expressions, recognition |
| TensorFlow.js (bundled by face-api) | 4.x | Apache-2.0 | Tensor runtime for face models |
| `@huggingface/transformers` | 3.7 | Apache-2.0 | Local CLIP inference |
| ONNX Runtime Web | 1.x | MIT | WASM runtime for CLIP |
| `@fontsource-variable/inter` | 5.2 | OFL-1.1 | Inter typeface |
| `@fontsource/fraunces` | 5.2 | OFL-1.1 | Fraunces typeface |

## Model weights and assets

| Asset | Source | Licence | Notes |
| --- | --- | --- | --- |
| Face detector, landmark, expression and recognition weights (`public/models`) | [face-api.js models](https://github.com/justadudewhohacks/face-api.js) / [@vladmandic/face-api](https://github.com/vladmandic/face-api) | MIT | Bundled with the app; full text in `public/models/FACE-API-LICENSE.txt` |
| CLIP ViT-B/32, quantised ONNX (`Xenova/clip-vit-base-patch32`) | [Xenova/clip-vit-base-patch32](https://huggingface.co/Xenova/clip-vit-base-patch32) | MIT | Not bundled; downloaded only after explicit consent and cached locally |
| ONNX Runtime WASM assets (`public/ort`) | [onnxruntime](https://github.com/microsoft/onnxruntime) | MIT | Served from the same origin |

## Development dependencies

The build and test toolchain (TypeScript, Vitest, jsdom, Testing Library, PostCSS, Autoprefixer, `vite-plugin-pwa`, Workbox, `@vitejs/plugin-react`, type packages) is used under MIT, Apache-2.0 or ISC licences. They are not included in the runtime bundle except where Vite inlines small helpers.

## Attribution

Ivory is an independent project. It is not affiliated with or endorsed by any of the projects above. If you redistribute Ivory or a modified version, retain the licence notices for the components and model weights you ship. The MIT and ISC licences require the copyright and permission notice to be included; the Apache-2.0 licence requires the licence text and notices to be preserved.

## Verifying licences

Licence metadata is available in `package-lock.json` and in each package's `node_modules/<package>/LICENSE` file. The bundled face-model licence is included in `public/models/FACE-API-LICENSE.txt`. The CLIP model card at the link above states its licence. If you add a dependency, model or asset, record it in this table before shipping.
