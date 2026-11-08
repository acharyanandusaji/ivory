import type { AlbumCategory, Photo, Project } from '@/types';
import { getOriginalBlob, getPreviewBlob, getThumbBlob } from './assets';
import {
  downloadBlob,
  extensionOf,
  formatBytes,
  formatDate,
  formatTime,
  sanitizeFilename,
  stripExtension,
} from './utils';

/* ------------------------------------------------------------------ shared */

export interface ExportProgress {
  done: number;
  total: number;
  bytes: number;
  currentName: string;
}

export interface ExportOptions {
  signal?: AbortSignal;
  onProgress?: (progress: ExportProgress) => void;
}

export interface ExportFile {
  name: string;
  blob: Blob;
  lastModified?: number;
}

export interface SaveResult {
  status: 'saved' | 'downloaded' | 'cancelled';
  bytes: number;
}

export class ExportCancelled extends Error {
  constructor() {
    super('Export cancelled');
    this.name = 'ExportCancelled';
  }
}

function assertNotCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ExportCancelled();
}

export function buildExportName(
  photo: Photo,
  index: number,
  template: string,
  options: { category?: boolean; prefix?: string } = {},
): string {
  const original = stripExtension(photo.name);
  const ext = extensionOf(photo.name) || 'jpg';
  const name = sanitizeFilename(original, `photo-${index + 1}`);
  const date = photo.capturedAt ? new Date(photo.capturedAt) : new Date(photo.addedAt);
  const datePart = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
  const padded = String(index + 1).padStart(4, '0');
  let base = template
    .replace(/\{name\}/gi, name)
    .replace(/\{index\}/gi, padded)
    .replace(/\{date\}/gi, datePart)
    .replace(/\{category\}/gi, photo.category ?? 'other')
    .replace(/\{project\}/gi, 'ivory');
  if (options.prefix) base = `${options.prefix}-${base}`;
  const safe = sanitizeFilename(`${base}.${ext}`, `photo-${padded}.${ext}`);
  // Folder prefixes are deliberately added after sanitising so the ZIP can
  // create category directories rather than a single flattened filename.
  if (options.category && photo.category) return `${photo.category}/${safe}`;
  return safe;
}

/* --------------------------------------------------------------------- csv */

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function buildCsv(photos: Photo[], peopleNameById: Map<string, string> = new Map()): string {
  const header = [
    'filename',
    'path',
    'captured_at',
    'width',
    'height',
    'mime',
    'size_bytes',
    'quality',
    'sharpness',
    'exposure',
    'composition',
    'faces',
    'people',
    'category',
    'favorite',
    'selected',
    'rejected',
    'rating',
    'flags',
    'notes',
  ];
  const rows = photos.map((photo) =>
    [
      photo.name,
      photo.path,
      photo.capturedAt ? new Date(photo.capturedAt).toISOString() : '',
      photo.width,
      photo.height,
      photo.mime,
      photo.size,
      photo.scores?.overall ?? '',
      photo.scores?.sharpness ?? '',
      photo.scores?.exposure ?? '',
      photo.scores?.composition ?? '',
      photo.faces.faceCount,
      photo.personIds.map((id) => peopleNameById.get(id) ?? 'Unknown').join(' | '),
      photo.category ?? '',
      photo.favorite ? 'yes' : 'no',
      photo.selected ? 'yes' : 'no',
      photo.rejected ? 'yes' : 'no',
      photo.rating,
      photo.flags.join(' | '),
      photo.notes,
    ]
      .map(csvCell)
      .join(','),
  );
  return `\uFEFF${[header.join(','), ...rows].join('\r\n')}\r\n`;
}

export function exportCsv(
  photos: Photo[],
  project: Project,
  peopleNameById: Map<string, string> = new Map(),
): void {
  const content = buildCsv(photos, peopleNameById);
  const filename = `${sanitizeFilename(project.name)}-library.csv`;
  downloadBlob(new Blob([content], { type: 'text/csv;charset=utf-8' }), filename);
}

/* ------------------------------------------------------------------- json */

export function buildManifest(
  project: Project,
  photos: Photo[],
  extra: Record<string, unknown> = {},
): string {
  return JSON.stringify(
    {
      application: 'Ivory',
      version: 1,
      exportedAt: new Date().toISOString(),
      project: {
        name: project.name,
        coupleNames: project.coupleNames,
        eventDate: project.eventDate,
        venue: project.venue,
        photographerName: project.photographerName,
        photographerContact: project.photographerContact,
        handoffNotes: project.handoffNotes,
      },
      photoCount: photos.length,
      photos: photos.map((photo) => ({
        id: photo.id,
        filename: photo.name,
        originalPath: photo.path,
        capturedAt: photo.capturedAt ? new Date(photo.capturedAt).toISOString() : null,
        width: photo.width,
        height: photo.height,
        bytes: photo.size,
        category: photo.category,
        people: photo.personIds,
        favorite: photo.favorite,
        selected: photo.selected,
        rejected: photo.rejected,
        rating: photo.rating,
        notes: photo.notes,
        flags: photo.flags,
        quality: photo.scores?.overall ?? null,
      })),
      ...extra,
    },
    null,
    2,
  );
}

export function exportManifest(
  project: Project,
  photos: Photo[],
  extra: Record<string, unknown> = {},
): void {
  downloadBlob(
    new Blob([buildManifest(project, photos, extra)], { type: 'application/json' }),
    `${sanitizeFilename(project.name)}-manifest.json`,
  );
}

/* -------------------------------------------------------------------- html */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildHandoffHtml(
  project: Project,
  photos: Photo[],
  peopleNameById: Map<string, string> = new Map(),
): string {
  const rows = photos
    .map((photo, index) => {
      const people = photo.personIds
        .map((id) => peopleNameById.get(id))
        .filter(Boolean)
        .join(', ');
      return `<tr>
        <td class="num">${index + 1}</td>
        <td><strong>${escapeHtml(photo.name)}</strong><span>${escapeHtml(photo.category ?? 'other')}</span></td>
        <td>${photo.capturedAt ? escapeHtml(formatDate(photo.capturedAt, true)) : '—'}</td>
        <td>${photo.favorite ? '★' : ''}${photo.selected ? ' ✓' : ''}</td>
        <td>${escapeHtml(people)}</td>
        <td class="num">${photo.scores?.overall ?? '—'}</td>
        <td>${escapeHtml(photo.notes)}</td>
      </tr>`;
    })
    .join('');

  const categories = [...new Set(photos.map((photo) => photo.category ?? 'other'))].sort();
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(project.name)} — Ivory handoff</title>
<style>
  :root { color-scheme: light; --ink:#211f1c; --soft:#605b54; --faint:#8f8980; --line:#e7e2da; --accent:#b08d57; --canvas:#faf9f6; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--canvas); color:var(--ink); font:13px/1.55 Inter, system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 1080px; margin: 0 auto; padding: 48px 24px 72px; }
  .eyebrow { margin:0 0 8px; font-size:10px; font-weight:700; letter-spacing:.22em; text-transform:uppercase; color:var(--accent); }
  h1 { margin:0; font: 400 40px/1.05 Fraunces, Georgia, serif; letter-spacing:-.02em; }
  .sub { margin:10px 0 0; color:var(--soft); max-width:640px; }
  .meta { display:flex; flex-wrap:wrap; gap:10px; margin:20px 0 0; }
  .pill { border:1px solid var(--line); background:#fff; border-radius:999px; padding:5px 11px; font-size:11px; color:var(--soft); }
  .cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:12px; margin:28px 0; }
  .card { border:1px solid var(--line); border-radius:14px; background:#fff; padding:14px; }
  .card b { display:block; font: 400 26px/1 Fraunces, Georgia, serif; margin-bottom:4px; }
  .card span { font-size:10px; text-transform:uppercase; letter-spacing:.12em; color:var(--faint); }
  table { width:100%; border-collapse:collapse; background:#fff; border:1px solid var(--line); border-radius:14px; overflow:hidden; }
  th { text-align:left; font-size:9.5px; text-transform:uppercase; letter-spacing:.12em; color:var(--faint); padding:10px 12px; border-bottom:1px solid var(--line); background:#f7f5f1; }
  td { padding:10px 12px; border-bottom:1px solid var(--line); vertical-align:top; }
  tr:last-child td { border-bottom:0; }
  td strong { display:block; font-weight:600; }
  td span { display:block; color:var(--faint); font-size:10px; margin-top:2px; }
  .num { text-align:right; font-variant-numeric:tabular-nums; color:var(--soft); }
  .notes { margin-top:20px; border-left:2px solid var(--accent); padding:2px 0 2px 14px; color:var(--soft); }
  footer { margin-top:28px; color:var(--faint); font-size:10.5px; }
  @media print { body { background:#fff; } main { padding:0; max-width:none; } .pill { background:#fff; } }
</style>
</head>
<body>
<main>
  <p class="eyebrow">Ivory · private handoff</p>
  <h1>${escapeHtml(project.coupleNames || project.name)}</h1>
  <p class="sub">${escapeHtml([project.venue, project.eventDate ? formatDate(Date.parse(`${project.eventDate}T12:00:00`)) : ''].filter(Boolean).join(' · ') || 'A private photo collection selected with Ivory.')}</p>
  <div class="meta">
    <span class="pill">${photos.length} photographs</span>
    <span class="pill">${categories.length} categories</span>
    <span class="pill">Exported ${escapeHtml(formatDate(Date.now(), true))}</span>
    <span class="pill">No cloud upload</span>
  </div>
  <div class="cards">
    <div class="card"><b>${photos.filter((photo) => photo.favorite).length}</b><span>Favourites</span></div>
    <div class="card"><b>${photos.filter((photo) => photo.selected).length}</b><span>In album</span></div>
    <div class="card"><b>${photos.filter((photo) => (photo.scores?.overall ?? 0) >= 75).length}</b><span>Top rated</span></div>
    <div class="card"><b>${peopleNameById.size}</b><span>People tagged</span></div>
  </div>
  ${project.handoffNotes ? `<p class="notes">${escapeHtml(project.handoffNotes)}</p>` : ''}
  <table>
    <thead><tr><th>#</th><th>Photograph</th><th>Captured</th><th>Marks</th><th>People</th><th class="num">Quality</th><th>Notes</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="7" style="text-align:center;color:#8f8980;padding:32px">No photographs in this selection.</td></tr>'}</tbody>
  </table>
  <footer>Generated locally by Ivory. Photograph files are delivered separately in the accompanying ZIP archive. No account, analytics or upload was involved.</footer>
</main>
</body>
</html>`;
}

export function exportHandoffHtml(
  project: Project,
  photos: Photo[],
  peopleNameById: Map<string, string> = new Map(),
): void {
  downloadBlob(
    new Blob([buildHandoffHtml(project, photos, peopleNameById)], { type: 'text/html;charset=utf-8' }),
    `${sanitizeFilename(project.name)}-handoff.html`,
  );
}

/* --------------------------------------------------------------------- zip */

interface ZipEntryInput {
  name: string;
  input: Blob;
  lastModified?: number;
}

async function collectZipEntries(
  photos: Photo[],
  options: {
    filenameTemplate: string;
    categoryFolders: boolean;
    includeManifest?: string;
    includeCsv?: string;
    onProgress?: (progress: ExportProgress) => void;
    signal?: AbortSignal;
  },
): Promise<ZipEntryInput[]> {
  const entries: ZipEntryInput[] = [];
  let bytes = 0;
  let done = 0;
  for (let index = 0; index < photos.length; index += 1) {
    assertNotCancelled(options.signal);
    const photo = photos[index];
    const blob = photo.originalStored ? await getOriginalBlob(photo.id) : await getPreviewBlob(photo.id);
    if (!blob) continue;
    bytes += blob.size;
    done += 1;
    entries.push({
      name: buildExportName(photo, index, options.filenameTemplate, {
        category: options.categoryFolders,
      }),
      input: blob,
      lastModified: photo.capturedAt ?? photo.addedAt,
    });
    options.onProgress?.({
      done,
      total: photos.length,
      bytes,
      currentName: photo.name,
    });
    // Yield to the event loop periodically so progress paint stays smooth.
    if (index % 8 === 7) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  if (options.includeManifest) {
    entries.push({
      name: 'ivory-manifest.json',
      input: new Blob([options.includeManifest], { type: 'application/json' }),
    });
  }
  if (options.includeCsv) {
    entries.push({
      name: 'ivory-library.csv',
      input: new Blob([options.includeCsv], { type: 'text/csv;charset=utf-8' }),
    });
  }
  return entries;
}

async function saveReadableStream(
  stream: ReadableStream<Uint8Array>,
  filename: string,
  signal?: AbortSignal,
): Promise<SaveResult> {
  const picker = (window as unknown as {
    showSaveFilePicker?: (options: unknown) => Promise<{
      createWritable: () => Promise<FileSystemWritableFileStream>;
    }>;
  }).showSaveFilePicker;
  if (typeof picker === 'function') {
    try {
      const handle = await picker({
        suggestedName: filename,
        types: [{ description: 'ZIP archive', accept: { 'application/zip': ['.zip'] } }],
      });
      const writable = await handle.createWritable();
      let bytes = 0;
      const counted = stream.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            bytes += chunk.byteLength;
            controller.enqueue(chunk);
          },
        }),
      );
      await counted.pipeTo(writable as unknown as WritableStream<Uint8Array>, { signal });
      return { status: 'saved', bytes };
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') {
        return { status: 'cancelled', bytes: 0 };
      }
      // The picker can fail in cross-origin frames or without a user gesture.
      // Fall back to a normal browser download rather than losing the export.
    }
  }
  const response = new Response(stream);
  const blob = await response.blob();
  downloadBlob(blob, filename);
  return { status: 'downloaded', bytes: blob.size };
}

export async function exportPhotosZip(
  photos: Photo[],
  options: ExportOptions & {
    filename: string;
    filenameTemplate: string;
    categoryFolders: boolean;
    manifest?: string;
    csv?: string;
  },
): Promise<SaveResult> {
  if (!photos.length) throw new Error('There are no photographs to export.');
  const entries = await collectZipEntries(photos, {
    filenameTemplate: options.filenameTemplate,
    categoryFolders: options.categoryFolders,
    includeManifest: options.manifest,
    includeCsv: options.csv,
    onProgress: options.onProgress,
    signal: options.signal,
  });
  assertNotCancelled(options.signal);
  const { downloadZip } = await import('client-zip');
  const response = downloadZip(entries);
  if (!response.body) throw new Error('The browser could not stream the ZIP archive.');
  return saveReadableStream(response.body, options.filename, options.signal);
}

/* --------------------------------------------------------------------- pdf */

async function blobToJpegDataUrl(blob: Blob, maxEdge = 1200): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    return canvas.toDataURL('image/jpeg', 0.84);
  } catch {
    return null;
  }
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read image'));
    reader.readAsDataURL(blob);
  });
}

async function loadPdfImage(photo: Photo, kind: 'thumb' | 'preview'): Promise<string | null> {
  const blob =
    kind === 'thumb' ? await getThumbBlob(photo.id) : await getPreviewBlob(photo.id);
  if (!blob) return null;
  const dataUrl = await blobToJpegDataUrl(blob, kind === 'thumb' ? 520 : 1400);
  if (dataUrl) return dataUrl;
  const raw = await blobToDataUrl(blob);
  return /^data:image\/(jpeg|png)/.test(raw) ? raw : null;
}

interface PdfPhoto {
  photo: Photo;
  dataUrl: string | null;
}

async function gatherPdfPhotos(
  photos: Photo[],
  kind: 'thumb' | 'preview',
  options: ExportOptions,
): Promise<PdfPhoto[]> {
  const result: PdfPhoto[] = [];
  let bytes = 0;
  for (let index = 0; index < photos.length; index += 1) {
    assertNotCancelled(options.signal);
    const photo = photos[index];
    const dataUrl = await loadPdfImage(photo, kind);
    if (dataUrl) bytes += Math.round(dataUrl.length * 0.75);
    result.push({ photo, dataUrl });
    options.onProgress?.({
      done: index + 1,
      total: photos.length,
      bytes,
      currentName: photo.name,
    });
    if (index % 6 === 5) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return result;
}

function drawImageContain(
  doc: import('jspdf').jsPDF,
  dataUrl: string,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const properties = doc.getImageProperties(dataUrl);
  const ratio = properties.width / properties.height;
  let drawWidth = width;
  let drawHeight = width / ratio;
  if (drawHeight > height) {
    drawHeight = height;
    drawWidth = height * ratio;
  }
  doc.addImage(
    dataUrl,
    'JPEG',
    x + (width - drawWidth) / 2,
    y + (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
    undefined,
    'FAST',
  );
}

export async function exportContactSheetPdf(
  project: Project,
  photos: Photo[],
  options: ExportOptions & { title?: string; columns?: number; includeNotes?: boolean } = {},
): Promise<void> {
  if (!photos.length) throw new Error('There are no photographs for a contact sheet.');
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const columns = Math.max(2, Math.min(6, options.columns ?? 4));
  const rows = 4;
  const headerHeight = 18;
  const footerHeight = 8;
  const gap = 4;
  const cellWidth = (pageWidth - margin * 2 - gap * (columns - 1)) / columns;
  const cellHeight = (pageHeight - margin * 2 - headerHeight - footerHeight - gap * (rows - 1)) / rows;
  const images = await gatherPdfPhotos(photos, 'thumb', options);
  const pages = Math.ceil(images.length / (rows * columns));
  let cursor = 0;

  for (let page = 0; page < pages; page += 1) {
    if (page > 0) doc.addPage();
    doc.setFillColor(250, 249, 246);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    doc.setTextColor(33, 31, 28);
    doc.setFont('times', 'normal');
    doc.setFontSize(17);
    doc.text(options.title ?? project.name, margin, margin + 1);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(143, 137, 128);
    doc.text(
      `${project.coupleNames ?? project.venue ?? 'Ivory contact sheet'} · Page ${page + 1} of ${pages}`,
      pageWidth - margin,
      margin + 1,
      { align: 'right' },
    );
    doc.setDrawColor(231, 226, 218);
    doc.line(margin, margin + 5, pageWidth - margin, margin + 5);

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        if (cursor >= images.length) break;
        const item = images[cursor];
        cursor += 1;
        const x = margin + column * (cellWidth + gap);
        const y = margin + headerHeight + row * (cellHeight + gap);
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(231, 226, 218);
        doc.roundedRect(x, y, cellWidth, cellHeight, 1.4, 1.4, 'FD');
        if (item.dataUrl) {
          drawImageContain(doc, item.dataUrl, x + 1.2, y + 1.2, cellWidth - 2.4, cellHeight - 8);
        } else {
          doc.setTextColor(180, 174, 165);
          doc.setFontSize(7);
          doc.text('Preview unavailable', x + cellWidth / 2, y + cellHeight / 2, { align: 'center' });
        }
        doc.setTextColor(96, 91, 84);
        doc.setFontSize(6.6);
        const label = `${cursor}. ${item.photo.name}`;
        doc.text(
          label.length > 42 ? `${label.slice(0, 41)}…` : label,
          x + 1.6,
          y + cellHeight - 3.4,
          { maxWidth: cellWidth - 3.2 },
        );
        if (item.photo.scores) {
          doc.setTextColor(176, 141, 87);
          doc.text(String(item.photo.scores.overall), x + cellWidth - 2, y + cellHeight - 3.4, {
            align: 'right',
          });
        }
      }
    }
    doc.setTextColor(160, 154, 145);
    doc.setFontSize(6.5);
    doc.text(
      'Generated locally by Ivory · quality scores are suggestions, not decisions',
      margin,
      pageHeight - 6,
    );
  }
  doc.save(`${sanitizeFilename(project.name)}-contact-sheet.pdf`);
}

export interface AlbumPdfOptions extends ExportOptions {
  title: string;
  subtitle?: string;
  notes?: string;
  layout?: 'two-up' | 'one-up';
}

export async function exportAlbumPdf(
  project: Project,
  photos: Photo[],
  options: AlbumPdfOptions,
): Promise<void> {
  if (!photos.length) throw new Error('Select photographs for the album first.');
  const { jsPDF } = await import('jspdf');
  const layout = options.layout ?? 'two-up';
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const images = await gatherPdfPhotos(photos, 'preview', options);

  // Cover
  doc.setFillColor(33, 31, 28);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');
  doc.setTextColor(201, 166, 107);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('IVORY · PRIVATE ALBUM', pageWidth / 2, 44, { align: 'center' });
  doc.setTextColor(250, 249, 246);
  doc.setFont('times', 'normal');
  doc.setFontSize(34);
  doc.text(options.title || project.name, pageWidth / 2, pageHeight / 2 - 4, {
    align: 'center',
    maxWidth: pageWidth - 70,
  });
  doc.setFontSize(12);
  doc.setTextColor(190, 183, 172);
  const subtitle =
    options.subtitle ||
    [project.coupleNames, project.venue, project.eventDate].filter(Boolean).join(' · ');
  if (subtitle) doc.text(subtitle, pageWidth / 2, pageHeight / 2 + 10, { align: 'center', maxWidth: pageWidth - 80 });
  doc.setFontSize(8);
  doc.setTextColor(138, 130, 119);
  doc.text(
    `${formatDate(Date.now())} · ${photos.length} photographs`,
    pageWidth / 2,
    pageHeight - 22,
    { align: 'center' },
  );

  const perPage = layout === 'two-up' ? 2 : 1;
  const totalPages = Math.ceil(images.length / perPage);
  for (let page = 0; page < totalPages; page += 1) {
    doc.addPage();
    doc.setFillColor(250, 249, 246);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    const slice = images.slice(page * perPage, page * perPage + perPage);
    const outer = 10;
    const gap = layout === 'two-up' ? 5 : 0;
    const slotWidth = layout === 'two-up' ? (pageWidth - outer * 2 - gap) / 2 : pageWidth - outer * 2;
    const slotHeight = pageHeight - outer * 2 - 8;
    slice.forEach((item, index) => {
      const x = outer + index * (slotWidth + gap);
      const y = outer;
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(231, 226, 218);
      doc.rect(x, y, slotWidth, slotHeight, 'FD');
      if (item.dataUrl) {
        drawImageContain(doc, item.dataUrl, x + 2, y + 2, slotWidth - 4, slotHeight - 4);
      }
      if (layout === 'one-up') {
        doc.setTextColor(96, 91, 84);
        doc.setFontSize(7.5);
        doc.text(item.photo.name, x + 3, y + slotHeight - 3);
      }
    });
    doc.setTextColor(143, 137, 128);
    doc.setFontSize(6.5);
    doc.text(options.title || project.name, outer, pageHeight - 5);
    doc.text(String(page + 1), pageWidth - outer, pageHeight - 5, { align: 'right' });
  }

  if (options.notes) {
    doc.addPage();
    doc.setFillColor(250, 249, 246);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    doc.setTextColor(33, 31, 28);
    doc.setFont('times', 'normal');
    doc.setFontSize(22);
    doc.text('Notes & credits', 20, 28);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(96, 91, 84);
    doc.text(options.notes, 20, 42, { maxWidth: pageWidth - 40 });
    doc.setFontSize(8);
    doc.setTextColor(143, 137, 128);
    doc.text(
      [
        project.photographerName ? `Photography: ${project.photographerName}` : '',
        project.photographerContact ?? '',
        `${photos.length} photographs selected with Ivory.`,
      ]
        .filter(Boolean)
        .join('\n'),
      20,
      pageHeight - 34,
    );
  }

  doc.save(`${sanitizeFilename(project.name)}-album.pdf`);
}

export async function exportReportPdf(
  project: Project,
  photos: Photo[],
  options: ExportOptions & {
    people: Array<{ name: string; role: string; faceCount: number }>;
    events: Array<{ name: string; start: number; count: number }>;
    selected: Photo[];
  },
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  doc.setFillColor(250, 249, 246);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');
  doc.setTextColor(176, 141, 87);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('IVORY · PRIVATE LIBRARY REPORT', margin, 22);
  doc.setTextColor(33, 31, 28);
  doc.setFont('times', 'normal');
  doc.setFontSize(28);
  doc.text(project.coupleNames || project.name, margin, 36, { maxWidth: pageWidth - margin * 2 });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(96, 91, 84);
  doc.text(
    [project.venue, project.eventDate ? formatDate(Date.parse(`${project.eventDate}T12:00:00`)) : '']
      .filter(Boolean)
      .join(' · ') || 'Private event library',
    margin,
    44,
  );

  const cards: Array<[string, string]> = [
    ['Photographs', String(photos.length)],
    ['In album', String(photos.filter((photo) => photo.selected).length)],
    ['Favourites', String(photos.filter((photo) => photo.favorite).length)],
    ['Top rated', String(photos.filter((photo) => (photo.scores?.overall ?? 0) >= 75).length)],
    ['People', String(options.people.length)],
    ['Moments', String(options.events.length)],
  ];
  const cardWidth = (pageWidth - margin * 2 - 10) / 3;
  cards.forEach(([label, value], index) => {
    const x = margin + (index % 3) * (cardWidth + 5);
    const y = 54 + Math.floor(index / 3) * 22;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(231, 226, 218);
    doc.roundedRect(x, y, cardWidth, 18, 2, 2, 'FD');
    doc.setTextColor(33, 31, 28);
    doc.setFont('times', 'normal');
    doc.setFontSize(16);
    doc.text(value, x + 4, y + 8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(143, 137, 128);
    doc.text(label.toUpperCase(), x + 4, y + 14);
  });

  let cursorY = 116;
  doc.setTextColor(33, 31, 28);
  doc.setFont('times', 'normal');
  doc.setFontSize(15);
  doc.text('Quality & coverage', margin, cursorY);
  cursorY += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(96, 91, 84);
  const scored = photos.filter((photo) => photo.scores);
  const average = scored.length
    ? Math.round(scored.reduce((sum, photo) => sum + (photo.scores?.overall ?? 0), 0) / scored.length)
    : 0;
  const flagged = photos.filter((photo) => photo.flags.length).length;
  const lines = [
    `Average quality: ${average} / 100`,
    `Photographs needing a second look: ${flagged}`,
    `Categories represented: ${new Set(photos.map((photo) => photo.category).filter(Boolean)).size}`,
    `Album target met: ${options.selected.length} photographs`,
    `Storage model: local IndexedDB only · no uploads or accounts`,
  ];
  for (const line of lines) {
    doc.text(`•  ${line}`, margin, cursorY);
    cursorY += 5.4;
  }

  cursorY += 4;
  doc.setTextColor(33, 31, 28);
  doc.setFont('times', 'normal');
  doc.setFontSize(15);
  doc.text('People', margin, cursorY);
  cursorY += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  if (options.people.length) {
    for (const person of options.people.slice(0, 14)) {
      doc.text(
        `${person.name}  ·  ${person.role}  ·  ${person.faceCount} faces`,
        margin,
        cursorY,
      );
      cursorY += 5;
    }
  } else {
    doc.setTextColor(143, 137, 128);
    doc.text('Face grouping is off or has not run yet.', margin, cursorY);
    cursorY += 5;
  }

  cursorY += 4;
  doc.setTextColor(33, 31, 28);
  doc.setFont('times', 'normal');
  doc.setFontSize(15);
  doc.text('Moments', margin, cursorY);
  cursorY += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  for (const event of options.events.slice(0, 12)) {
    doc.text(`${event.name}  ·  ${formatDate(event.start)}  ·  ${event.count} photographs`, margin, cursorY);
    cursorY += 5;
  }

  if (project.handoffNotes) {
    cursorY += 3;
    doc.setFont('times', 'normal');
    doc.setFontSize(13);
    doc.setTextColor(33, 31, 28);
    doc.text('Handoff notes', margin, cursorY);
    cursorY += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(96, 91, 84);
    doc.text(project.handoffNotes, margin, cursorY, { maxWidth: pageWidth - margin * 2 });
  }

  doc.setFontSize(6.5);
  doc.setTextColor(160, 154, 145);
  doc.text('Generated locally by Ivory · Ivory never deletes or discards a photograph automatically.', margin, pageHeight - 12);

  // A compact visual index of the album selection.
  const preview = options.selected.length ? options.selected : photos.slice(0, 40);
  if (preview.length) {
    const images = await gatherPdfPhotos(preview.slice(0, 24), 'thumb', options);
    doc.addPage();
    doc.setFillColor(250, 249, 246);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    doc.setTextColor(33, 31, 28);
    doc.setFont('times', 'normal');
    doc.setFontSize(18);
    doc.text('Album index', margin, 22);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(143, 137, 128);
    doc.text(`${preview.length} photographs selected`, pageWidth - margin, 22, { align: 'right' });
    const columns = 4;
    const cellWidth = (pageWidth - margin * 2 - 9) / columns;
    const cellHeight = 46;
    images.forEach((item, index) => {
      const x = margin + (index % columns) * (cellWidth + 3);
      const y = 30 + Math.floor(index / columns) * (cellHeight + 4);
      if (y + cellHeight > pageHeight - 14) return;
      doc.setDrawColor(231, 226, 218);
      doc.setFillColor(255, 255, 255);
      doc.rect(x, y, cellWidth, cellHeight, 'FD');
      if (item.dataUrl) drawImageContain(doc, item.dataUrl, x + 1, y + 1, cellWidth - 2, cellHeight - 7);
      doc.setFontSize(6);
      doc.setTextColor(96, 91, 84);
      doc.text(item.photo.name.slice(0, 38), x + 1.5, y + cellHeight - 2.4, {
        maxWidth: cellWidth - 3,
      });
    });
  }

  doc.save(`${sanitizeFilename(project.name)}-report.pdf`);
}

/* ----------------------------------------------------------- album helpers */

export function groupAlbumPhotos(
  photos: Photo[],
  categoryOrder: AlbumCategory[] = [],
): Array<{ category: AlbumCategory | 'other'; photos: Photo[] }> {
  const groups = new Map<AlbumCategory | 'other', Photo[]>();
  for (const photo of photos) {
    const key = (photo.category ?? 'other') as AlbumCategory | 'other';
    const list = groups.get(key);
    if (list) list.push(photo);
    else groups.set(key, [photo]);
  }
  const present = Array.from(groups.keys()) as AlbumCategory[];
  const order: AlbumCategory[] = [];
  for (const category of categoryOrder) {
    if (groups.has(category) && !order.includes(category)) order.push(category);
  }
  for (const category of present) {
    if (!order.includes(category)) order.push(category);
  }
  return order
    .map((category) => ({
      category,
      photos: (groups.get(category) ?? []).sort(
        (a, b) => (a.capturedAt ?? a.addedAt) - (b.capturedAt ?? b.addedAt),
      ),
    }))
    .filter((group) => group.photos.length);
}

export function formatExportSummary(
  photos: Photo[],
  options: { originals: boolean },
): string {
  const bytes = photos.reduce((sum, photo) => sum + photo.size, 0);
  return `${photos.length} photographs · ${formatBytes(bytes)}${options.originals ? '' : ' (previews will be used where originals are missing)'}`;
}

export function describePhotoForPdf(photo: Photo): string {
  return `${photo.name} · ${photo.width}×${photo.height} · ${
    photo.capturedAt ? `${formatDate(photo.capturedAt)} ${formatTime(photo.capturedAt)}` : 'no capture date'
  }`;
}
