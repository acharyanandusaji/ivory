import { describe, expect, it } from 'vitest';
import {
  buildCsv,
  buildExportName,
  buildHandoffHtml,
  buildManifest,
  groupAlbumPhotos,
  formatExportSummary,
  describePhotoForPdf,
} from '@/lib/exporter';
import { makeEvent, makeProject, makeScores } from '@/test/fixtures';
import { makePhoto } from '@/test/fixtures';

const capturedAt = new Date(2026, 6, 12, 12, 0, 0).getTime();

describe('buildExportName', () => {
  it('expands every supported token and normalises the extension', () => {
    const photo = makePhoto({
      id: 'name-1',
      name: 'IMG_001.JPG',
      capturedAt,
      category: 'couple',
    });
    expect(buildExportName(photo, 0, '{date}-{index}-{name}')).toBe('2026-07-12-0001-IMG_001.jpg');
  });

  it('creates category folders without flattening the path', () => {
    const photo = makePhoto({ name: 'IMG_001.jpg', capturedAt, category: 'couple' });
    expect(buildExportName(photo, 0, '{name}', { category: true })).toBe('couple/IMG_001.jpg');
    expect(buildExportName(photo, 0, '{name}', { category: false })).toBe('IMG_001.jpg');
  });

  it('sanitises unsafe filename characters but keeps folder separators', () => {
    const photo = makePhoto({ name: 'a/b:c.jpg', capturedAt, category: 'portraits' });
    expect(buildExportName(photo, 2, '{name}', { category: true })).toBe('portraits/a_b_c.jpg');
  });

  it('supports project and index tokens with a prefix', () => {
    const photo = makePhoto({ name: 'frame.png', capturedAt });
    expect(buildExportName(photo, 8, '{project}-{index}', { prefix: 'ivory' })).toBe('ivory-ivory-0009.png');
  });
});

describe('CSV export', () => {
  it('emits a BOM, header and quoted cells', () => {
    const photo = makePhoto({
      id: 'csv-1',
      name: 'IMG,001.jpg',
      notes: 'Lovely "light"',
      personIds: ['aisha'],
      category: 'couple',
      favorite: true,
      flags: ['blurry'],
      scores: makeScores({ overall: 80, sharpness: 81, exposure: 82, composition: 83 }),
    });
    const csv = buildCsv([photo], new Map([['aisha', 'Aisha']]));
    expect(csv.startsWith('\uFEFFfilename,path,captured_at')).toBe(true);
    expect(csv.endsWith('\r\n')).toBe(true);
    const [, row] = csv.replace('\uFEFF', '').split('\r\n');
    expect(row).toContain('"IMG,001.jpg"');
    expect(row).toContain('"Lovely ""light"""');
    expect(row).toContain('Aisha');
    expect(row).toContain('yes,no,no');
    expect(row).toContain('80,81,82,83');
    expect(row).toContain('blurry');
  });

  it('writes an empty body with a trailing newline for no photos', () => {
    const csv = buildCsv([]);
    expect(csv.split('\r\n').filter(Boolean)).toHaveLength(1);
  });
});

describe('manifest export', () => {
  it('records project details, photo metadata and extras', () => {
    const project = makeProject({ name: 'Summer wedding', coupleNames: 'Aisha & Noah' });
    const photo = makePhoto({
      id: 'manifest-1',
      name: 'frame.jpg',
      capturedAt,
      category: 'ceremony',
      personIds: ['aisha'],
      favorite: true,
      selected: true,
      rating: 4,
      notes: 'Vows',
      flags: ['low-resolution'],
      scores: makeScores({ overall: 88 }),
    });
    const manifest = JSON.parse(
      buildManifest(project, [photo], { scope: 'album', people: [{ name: 'Aisha' }] }),
    );
    expect(manifest.application).toBe('Ivory');
    expect(manifest.version).toBe(1);
    expect(manifest.project.name).toBe('Summer wedding');
    expect(manifest.project.coupleNames).toBe('Aisha & Noah');
    expect(manifest.photoCount).toBe(1);
    expect(manifest.photos[0]).toMatchObject({
      filename: 'frame.jpg',
      category: 'ceremony',
      people: ['aisha'],
      favorite: true,
      selected: true,
      quality: 88,
    });
    expect(manifest.scope).toBe('album');
  });

  it('writes null for missing capture dates and quality', () => {
    const photo = makePhoto({ capturedAt: null, scores: undefined });
    const manifest = JSON.parse(buildManifest(makeProject(), [photo]));
    expect(manifest.photos[0].capturedAt).toBeNull();
    expect(manifest.photos[0].quality).toBeNull();
  });
});

describe('handoff sheet', () => {
  it('escapes project and photo text', () => {
    const project = makeProject({
      coupleNames: 'A & B <script>',
      handoffNotes: '<b>Deliver</b>',
    });
    const photo = makePhoto({ name: 'frame<1>.jpg', notes: 'say "cheese"' });
    const html = buildHandoffHtml(project, [photo], new Map());
    expect(html).toContain('A &amp; B &lt;script&gt;');
    expect(html).toContain('&lt;b&gt;Deliver&lt;/b&gt;');
    expect(html).toContain('frame&lt;1&gt;.jpg');
    expect(html).toContain('say &quot;cheese&quot;');
    expect(html).toContain('No cloud upload');
  });

  it('renders an empty-state row for an empty selection', () => {
    const html = buildHandoffHtml(makeProject(), []);
    expect(html).toContain('No photographs in this selection.');
  });
});

describe('album ordering', () => {
  it('orders categories explicitly, then includes the remaining categories', () => {
    const coupleA = makePhoto({ id: 'couple-a', category: 'couple', capturedAt: 100 });
    const ceremony = makePhoto({ id: 'ceremony', category: 'ceremony', capturedAt: 50 });
    const coupleB = makePhoto({ id: 'couple-b', category: 'couple', capturedAt: 200 });
    const other = makePhoto({ id: 'other', category: undefined, capturedAt: 10 });
    const groups = groupAlbumPhotos([ceremony, coupleB, other, coupleA], ['couple']);
    expect(groups.map((group) => group.category)).toEqual(['couple', 'ceremony', 'other']);
    expect(groups[0].photos.map((photo) => photo.id)).toEqual(['couple-a', 'couple-b']);
  });

  it('uses insertion order when no explicit order is provided', () => {
    const ceremony = makePhoto({ id: 'ceremony', category: 'ceremony' });
    const couple = makePhoto({ id: 'couple', category: 'couple' });
    const groups = groupAlbumPhotos([ceremony, couple], []);
    expect(groups.map((group) => group.category)).toEqual(['ceremony', 'couple']);
  });
});

describe('export summaries', () => {
  it('describes the archive size and original availability', () => {
    const photos = [
      makePhoto({ id: 'a', size: 1000 }),
      makePhoto({ id: 'b', size: 2000 }),
    ];
    expect(formatExportSummary(photos, { originals: true })).toBe('2 photographs · 2.9 KB');
    expect(formatExportSummary(photos, { originals: false })).toContain('previews will be used');
  });

  it('describes a photo for PDF captions', () => {
    const photo = makePhoto({ name: 'frame.jpg', width: 6000, height: 4000, capturedAt });
    expect(describePhotoForPdf(photo)).toContain('frame.jpg · 6000×4000');
  });

  it('does not mutate fixture events', () => {
    expect(makeEvent().name.startsWith('Moment ')).toBe(true);
  });
});
