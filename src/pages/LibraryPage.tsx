import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  Check,
  ChevronDown,
  Columns3,
  Filter,
  Heart,
  Images,
  LayoutGrid,
  ListFilter,
  Rows3,
  Search,
  Sparkles,
  Undo2,
  X,
} from 'lucide-react';
import type { Photo } from '@/types';
import { useAppStore } from '@/store/appStore';
import { useLibraryView, activeFilterCount } from '@/hooks/useLibrary';
import { PageHeader } from '@/components/layout/PageHeader';
import { ProjectGate } from '@/components/ProjectGate';
import { FilterRail } from '@/components/FilterRail';
import { PhotoGrid } from '@/components/PhotoGrid';
import { PhotoLightbox } from '@/components/PhotoLightbox';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  IconButton,
  Drawer,
  Select,
  TextInput,
} from '@/components/ui';
import { formatCount } from '@/lib/utils';

export function LibraryPage() {
  return (
    <ProjectGate feature="the library">
      <LibraryWorkspace />
    </ProjectGate>
  );
}

function LibraryWorkspace() {
  const photos = useAppStore((state) => state.photos);
  const processing = useAppStore((state) => state.processing);
  const settings = useAppStore((state) => state.settings);
  const filters = useAppStore((state) => state.filters);
  const setFilters = useAppStore((state) => state.setFilters);
  const resetFilters = useAppStore((state) => state.resetFilters);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const applyPhotoPatch = useAppStore((state) => state.applyPhotoPatch);
  const selectAll = useAppStore((state) => state.selectAll);
  const clearSelection = useAppStore((state) => state.clearSelection);
  const removeFromAlbum = useAppStore((state) => state.removeFromAlbum);
  const addCompare = useAppStore((state) => state.addCompare);
  const pushToast = useAppStore((state) => state.pushToast);
  const undo = useAppStore((state) => state.undo);
  const undoLast = useAppStore((state) => state.undoLast);
  const navigate = useNavigate();

  const { photos: visible, groups } = useLibraryView();
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [mobileFilters, setMobileFilters] = useState(false);

  const selected = useMemo(() => photos.filter((photo) => photo.selected), [photos]);
  const filterCount = activeFilterCount(filters);
  const selectedVisible = useMemo(() => visible.filter((photo) => photo.selected), [visible]);

  const openPhoto = (photo: Photo) => {
    const index = visible.findIndex((item) => item.id === photo.id);
    setLightbox(index >= 0 ? index : null);
  };

  const bulk = async (
    label: string,
    patch: Partial<Photo>,
    toastTitle: string,
    action?: (ids: string[]) => Promise<void>,
  ) => {
    const ids = selected.map((photo) => photo.id);
    if (!ids.length) return;
    if (action) await action(ids);
    else await applyPhotoPatch(ids, patch, { label, toastTitle, undo: true });
  };

  const selectAllVisible = async () => {
    await selectAll(visible.map((photo) => photo.id));
    pushToast({
      title: `${formatCount(visible.length)} photographs added to the album`,
      description: 'Nothing was removed. Use Undo if this was too broad.',
      tone: 'success',
      action: { label: 'Undo', run: () => void undoLast() },
    });
  };

  const showCompare = () => {
    if (!selected.length) return;
    addCompare(selected.slice(0, 4).map((photo) => photo.id));
    navigate('/compare');
  };

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Library"
        title="Every frame, in order"
        description="Browse the full collection, filter by people and moments, and decide what belongs in the album. Ivory only recommends — you stay in control."
        actions={
          <>
            <Button variant="secondary" icon={<Sparkles className="h-4 w-4" />} onClick={() => navigate('/review')}>
              Review sets
            </Button>
            <Button variant="primary" icon={<Check className="h-4 w-4" />} onClick={() => navigate('/album')}>
              Build album
            </Button>
          </>
        }
      />

      {processing.running ? (
        <Card className="mb-5 flex flex-col gap-3 border-accent/25 bg-accent-soft/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[12.5px] font-medium text-ink">Analysis is still running</p>
            <p className="mt-0.5 text-[11px] text-soft">
              {formatCount(processing.completed)} of {formatCount(processing.total)} · quality scores and groups will refine as it finishes.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => navigate('/import')}>
            View progress
          </Button>
        </Card>
      ) : null}

      {!photos.length ? (
        <EmptyState
          icon={<Images className="h-5 w-5" />}
          title="The library is empty"
          description="Import photographs, a folder or a ZIP archive. Ivory reads EXIF, fingerprints files and begins local analysis automatically."
          action={
            <Button variant="primary" onClick={() => navigate('/import')}>
              Import photographs
            </Button>
          }
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)]">
          <FilterRail className="sticky top-[72px] hidden max-h-[calc(100vh-96px)] lg:flex" />

          <div className="min-w-0">
            <Card className="mb-4 p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[190px] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
                  <TextInput
                    value={filters.search}
                    onChange={(event) => setFilters({ search: event.target.value })}
                    placeholder="Search filenames, notes, people or moments…"
                    className="h-9 pl-9 pr-8 text-[12px]"
                    aria-label="Search the library"
                  />
                  {filters.search ? (
                    <button
                      type="button"
                      onClick={() => setFilters({ search: '' })}
                      className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-faint hover:bg-ink/[.05] hover:text-ink"
                      aria-label="Clear search"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  ) : null}
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  className="lg:hidden"
                  icon={<ListFilter className="h-3.5 w-3.5" />}
                  onClick={() => setMobileFilters(true)}
                >
                  Filters {filterCount ? `(${filterCount})` : ''}
                </Button>

                <div className="flex items-center gap-1.5">
                  <Select
                    value={filters.sort}
                    onChange={(event) => setFilters({ sort: event.target.value as typeof filters.sort })}
                    className="h-9 w-[132px] text-[11.5px]"
                    aria-label="Sort photographs"
                  >
                    <option value="quality">Quality</option>
                    <option value="date">Capture date</option>
                    <option value="name">Filename</option>
                    <option value="faces">Faces</option>
                  </Select>
                  <IconButton
                    label={settings.gridDensity === 'compact' ? 'Comfortable grid' : 'Compact grid'}
                    size="sm"
                    onClick={() =>
                      updateSettings({
                        gridDensity: settings.gridDensity === 'compact' ? 'comfortable' : 'compact',
                      })
                    }
                  >
                    {settings.gridDensity === 'compact' ? <LayoutGrid className="h-3.5 w-3.5" /> : <Rows3 className="h-3.5 w-3.5" />}
                  </IconButton>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line px-1 pt-2 text-[10.5px]">
                <span className="text-faint">
                  <span className="font-medium tabular-nums text-soft">{formatCount(visible.length)}</span> of {formatCount(photos.length)} photographs
                </span>
                {selected.length ? (
                  <span className="text-accent">{formatCount(selected.length)} in album</span>
                ) : null}
                {filterCount ? (
                  <button type="button" onClick={resetFilters} className="font-medium text-accent hover:underline">
                    Clear {filterCount} filter{filterCount === 1 ? '' : 's'}
                  </button>
                ) : null}
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void selectAllVisible()}
                    className="font-medium text-soft transition-colors hover:text-ink"
                  >
                    Select visible
                  </button>
                  {selected.length ? (
                    <button
                      type="button"
                      onClick={() => void clearSelection()}
                      className="font-medium text-soft transition-colors hover:text-danger"
                    >
                      Clear selection
                    </button>
                  ) : null}
                </div>
              </div>
            </Card>

            {visible.length ? (
              <PhotoGrid
                photos={visible}
                onOpen={openPhoto}
                empty={null}
                density={settings.gridDensity}
              />
            ) : (
              <EmptyState
                compact
                icon={<Filter className="h-5 w-5" />}
                title="No photographs match these filters"
                description="Try clearing a filter or searching for a different person, moment or filename. Nothing has been removed."
                action={
                  <Button variant="secondary" size="sm" onClick={resetFilters}>
                    Reset filters
                  </Button>
                }
              />
            )}

            {groups.length && !filters.groupType ? (
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl2 border border-line bg-surface/60 px-4 py-3">
                <div className="flex items-center gap-2 text-[11.5px] text-soft">
                  <Sparkles className="h-3.5 w-3.5 text-accent" />
                  {formatCount(groups.length)} similar and burst sets detected. Review them together to choose the best frame.
                </div>
                <Button variant="ghost" size="sm" onClick={() => navigate('/review')}>
                  Open Review <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      <Drawer open={mobileFilters} onClose={() => setMobileFilters(false)} title="Filter the library" width="md">
        <FilterRail onClose={() => setMobileFilters(false)} className="min-h-full rounded-none border-0 shadow-none" />
      </Drawer>

      {selected.length ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 py-3 shadow-lift backdrop-blur lg:left-[248px]">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-2">
            <span className="mr-1 flex items-center gap-2 text-[12px] font-medium text-ink">
              <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-accent px-1.5 text-[10.5px] font-semibold text-accent-ink">
                {formatCount(selected.length)}
              </span>
              selected for the album
              {selectedVisible.length && selectedVisible.length !== selected.length ? (
                <span className="text-[10.5px] font-normal text-faint">({selectedVisible.length} visible)</span>
              ) : null}
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                icon={<Heart className="h-3.5 w-3.5" />}
                onClick={() =>
                  void bulk('Favourite selection', { favorite: true }, `${formatCount(selected.length)} photographs favourited`)
                }
              >
                Favourite
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={<Columns3 className="h-3.5 w-3.5" />}
                onClick={showCompare}
              >
                Compare
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={<Undo2 className="h-3.5 w-3.5" />}
                onClick={() => void undoLast()}
                disabled={!undo}
                title={undo ? `Undo ${undo.label}` : 'Nothing to undo'}
              >
                Undo
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void removeFromAlbum(selected.map((photo) => photo.id))}
              >
                Remove from album
              </Button>
              <Button variant="primary" size="sm" onClick={() => navigate('/album')}>
                Open album
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {lightbox !== null && visible[lightbox] ? (
        <PhotoLightbox
          photos={visible}
          index={lightbox}
          onIndexChange={setLightbox}
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </div>
  );
}
