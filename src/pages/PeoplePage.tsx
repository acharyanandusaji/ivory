import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  ArrowRight,
  Check,
  GitMerge,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import type { Person, PersonRole } from '@/types';
import { useAppStore } from '@/store/appStore';
import { useFaceUrl, useThumbUrl } from '@/hooks/useApp';
import { PageHeader } from '@/components/layout/PageHeader';
import { ProjectGate } from '@/components/ProjectGate';
import { PersonAvatar } from '@/components/PersonAvatar';
import {
  Button,
  Card,
  Chip,
  Drawer,
  EmptyState,
  Field,
  Modal,
  Select,
  TextInput,
} from '@/components/ui';
import { PERSON_ROLES } from '@/lib/constants';
import { cosineSimilarity } from '@/lib/search';
import { formatCount } from '@/lib/utils';

const ROLE_LABEL = new Map(PERSON_ROLES.map((role) => [role.id, role.label]));

function roleTone(role: PersonRole): 'accent' | 'success' | 'neutral' {
  if (role === 'bride' || role === 'groom') return 'accent';
  if (role === 'family' || role === 'friend') return 'success';
  return 'neutral';
}

export function PeoplePage() {
  return (
    <ProjectGate feature="People">
      <PeopleWorkspace />
    </ProjectGate>
  );
}

function PeopleWorkspace() {
  const project = useAppStore((state) => state.project)!;
  const people = useAppStore((state) => state.people);
  const faces = useAppStore((state) => state.faces);
  const photos = useAppStore((state) => state.photos);
  const mergePeople = useAppStore((state) => state.mergePeople);
  const removePerson = useAppStore((state) => state.removePerson);
  const renamePerson = useAppStore((state) => state.renamePerson);
  const setPersonRole = useAppStore((state) => state.setPersonRole);
  const rebuildPeople = useAppStore((state) => state.rebuildPeople);
  const updateProject = useAppStore((state) => state.updateProject);
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'faces' | 'name' | 'recent'>('faces');
  const [roleFilter, setRoleFilter] = useState<'all' | PersonRole>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState('');
  const [removing, setRemoving] = useState<Person | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const selected = people.find((person) => person.id === selectedId) ?? null;
  const facesById = useMemo(() => new Map(faces.map((face) => [face.id, face])), [faces]);

  const photoCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const photo of photos) {
      for (const id of photo.personIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [photos]);

  useEffect(() => {
    setNameDraft(selected?.name ?? '');
    setMergeTarget('');
  }, [selected?.id, selected?.name]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const list = people.filter((person) => {
      if (roleFilter !== 'all' && person.role !== roleFilter) return false;
      if (!term) return true;
      return person.name.toLowerCase().includes(term) || person.role.includes(term);
    });
    return list.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'recent') return b.updatedAt - a.updatedAt;
      return b.faceCount - a.faceCount;
    });
  }, [people, query, roleFilter, sort]);

  const mergeSuggestions = useMemo(() => {
    const unnamed = people.filter(
      (person) => person.role === 'other' && (/^Person \d+$/.test(person.name) || !person.name.trim()),
    );
    const suggestions: Array<{ a: Person; b: Person; distance: number }> = [];
    for (let i = 0; i < unnamed.length; i += 1) {
      for (let j = i + 1; j < unnamed.length; j += 1) {
        const a = unnamed[i];
        const b = unnamed[j];
        if (!a.centroid || !b.centroid) continue;
        const distance = 1 - cosineSimilarity(a.centroid, b.centroid);
        if (distance < 0.5) suggestions.push({ a, b, distance });
      }
    }
    return suggestions.sort((left, right) => left.distance - right.distance).slice(0, 4);
  }, [people]);

  const selectedPhotos = useMemo(() => {
    if (!selected) return [];
    return photos
      .filter((photo) => photo.personIds.includes(selected.id))
      .sort((a, b) => (b.scores?.overall ?? 0) - (a.scores?.overall ?? 0));
  }, [photos, selected]);

  const selectedFaces = useMemo(
    () =>
      selected
        ? faces
            .filter((face) => face.personId === selected.id && !face.ignored)
            .sort((a, b) => b.faceScore - a.faceScore)
            .slice(0, 10)
        : [],
    [faces, selected],
  );

  const saveName = async () => {
    if (!selected) return;
    const name = nameDraft.trim();
    if (!name || name === selected.name) {
      setNameDraft(selected.name);
      return;
    }
    await renamePerson(selected.id, name);
  };

  const openInLibrary = () => {
    if (!selected) return;
    useAppStore.getState().setFilters({
      peopleIds: [selected.id],
      smart: [],
      search: '',
      onlyRejected: false,
      hideRejected: true,
    });
    navigate('/library');
  };

  const openMerge = async () => {
    if (!selected || !mergeTarget) return;
    setBusy(true);
    await mergePeople(selected.id, mergeTarget);
    setBusy(false);
    setMergeTarget('');
    setSelectedId(mergeTarget);
  };

  if (!photos.length) {
    return (
      <div className="animate-fade-up">
        <PageHeader eyebrow="People" title="The people in the story" description="Face grouping runs locally and can be erased at any time. Name people, merge duplicates and correct the model." />
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title="No photographs to group yet"
          description="Import photographs first, then enable face grouping in Settings or when creating the library."
          action={<Button variant="primary" onClick={() => navigate('/import')}>Import photographs</Button>}
        />
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="People"
        title="The people in the story"
        description="Face descriptors never leave this browser. Rename, merge, or remove a person at any time — photographs are never deleted."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<RefreshCw className="h-4 w-4" />}
              onClick={() => void rebuildPeople()}
            >
              Regroup unnamed
            </Button>
            <Button variant="primary" onClick={() => navigate('/library')}>
              Open library
            </Button>
          </>
        }
      >
        <div className="mt-4 flex flex-wrap gap-1.5">
          <Chip tone="accent">{formatCount(people.length)} people</Chip>
          <Chip>{formatCount(faces.filter((face) => !face.ignored).length)} faces grouped</Chip>
          <Chip tone={project.consentFace ? 'success' : 'danger'}>
            {project.consentFace ? 'Face grouping on, local' : 'Face grouping off'}
          </Chip>
        </div>
      </PageHeader>

      {!project.consentFace ? (
        <Card className="mb-5 flex flex-col gap-3 border-accent/25 bg-accent-soft/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[12.5px] font-medium text-ink">Face grouping is currently off</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-soft">
              Turn it on to group faces into People. The model runs on your device and you can delete descriptors at any time.
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={() => void updateProject({ consentFace: true })}>
            Enable local face grouping
          </Button>
        </Card>
      ) : null}

      {mergeSuggestions.length ? (
        <Card className="mb-5 overflow-hidden">
          <div className="border-b border-line px-4 py-3">
            <p className="flex items-center gap-2 text-[12px] font-medium text-ink">
              <GitMerge className="h-4 w-4 text-accent" /> Possible duplicate people
            </p>
            <p className="mt-0.5 text-[10.5px] text-faint">
              Ivory only suggests unnamed clusters. Merge them if they are the same person.
            </p>
          </div>
          <div className="divide-y divide-line">
            {mergeSuggestions.map(({ a, b, distance }) => (
              <div key={`${a.id}-${b.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="flex items-center gap-2">
                  <PersonAvatar person={a} faces={faces} size={32} />
                  <span className="text-[11.5px] font-medium text-ink">{a.name}</span>
                </div>
                <GitMerge className="h-3.5 w-3.5 text-faint" />
                <div className="flex items-center gap-2">
                  <PersonAvatar person={b} faces={faces} size={32} />
                  <span className="text-[11.5px] font-medium text-ink">{b.name}</span>
                </div>
                <span className="text-[10px] text-faint">{Math.round((1 - distance) * 100)}% similar</span>
                <div className="ml-auto flex gap-1.5">
                  <Button variant="secondary" size="sm" onClick={() => void mergePeople(b.id, a.id)}>
                    Same person
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedId(a.id)}>
                    Review
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {people.length ? (
        <Card className="mb-4 p-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[180px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
              <TextInput
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a person…"
                className="h-9 pl-9 text-[12px]"
                aria-label="Search people"
              />
            </div>
            <Select
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value as typeof roleFilter)}
              className="h-9 w-[136px] text-[11.5px]"
              aria-label="Filter by role"
            >
              <option value="all">All roles</option>
              {PERSON_ROLES.map((role) => (
                <option key={role.id} value={role.id}>{role.label}</option>
              ))}
            </Select>
            <Select
              value={sort}
              onChange={(event) => setSort(event.target.value as typeof sort)}
              className="h-9 w-[126px] text-[11.5px]"
              aria-label="Sort people"
            >
              <option value="faces">Most faces</option>
              <option value="name">Name</option>
              <option value="recent">Recently updated</option>
            </Select>
          </div>
        </Card>
      ) : null}

      {filtered.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {filtered.map((person) => {
            const photoCount = photoCounts.get(person.id) ?? 0;
            return (
              <button
                key={person.id}
                type="button"
                onClick={() => setSelectedId(person.id)}
                className="group flex flex-col items-center rounded-xl2 border border-line bg-surface p-4 text-center shadow-soft transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-lift"
              >
                <span className="relative">
                  <PersonAvatar person={person} faces={faces} size={72} />
                  <span className="absolute -bottom-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full border border-surface bg-ink px-1 text-[8.5px] font-semibold text-canvas">
                    {person.faceCount}
                  </span>
                </span>
                <span className="mt-3 w-full truncate text-[12.5px] font-medium text-ink">{person.name}</span>
                <span className="mt-1">
                  <Chip tone={roleTone(person.role)} className="px-2 py-0.5 text-[9px]">
                    {ROLE_LABEL.get(person.role) ?? 'Guest'}
                  </Chip>
                </span>
                <span className="mt-2 text-[10px] text-faint">
                  {formatCount(photoCount)} photograph{photoCount === 1 ? '' : 's'}
                </span>
              </button>
            );
          })}
          {!filtered.length ? (
            <div className="col-span-full">
              <EmptyState
                compact
                icon={<UserRound className="h-5 w-5" />}
                title="No people match"
                description="Try a different name or role. People are created only after local face analysis."
              />
            </div>
          ) : null}
        </div>
      ) : (
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title={project.consentFace ? 'No people grouped yet' : 'Face grouping is off'}
          description={
            project.consentFace
              ? 'Run or re-run analysis from Import to detect faces. Clusters will appear here automatically.'
              : 'Enable local face grouping above to create private People albums. Descriptors stay in this browser.'
          }
          action={
            project.consentFace ? (
              <Button variant="primary" onClick={() => navigate('/import')}>
                Open analysis
              </Button>
            ) : (
              <Button variant="primary" onClick={() => void updateProject({ consentFace: true })}>
                Enable face grouping
              </Button>
            )
          }
        />
      )}

      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelectedId(null)}
        title={selected?.name}
        subtitle={selected ? `${formatCount(selected.faceCount)} faces · ${formatCount(selectedPhotos.length)} photographs` : undefined}
        width="lg"
      >
        {selected ? (
          <div className="space-y-6 p-5">
            <div className="flex flex-col items-center gap-3 rounded-xl2 border border-line bg-raised/50 p-5 text-center">
              <PersonAvatar person={selected} faces={faces} size={96} />
              <div>
                <p className="display text-xl text-ink">{selected.name}</p>
                <p className="mt-1 text-[11px] text-faint">
                  {ROLE_LABEL.get(selected.role) ?? 'Guest'}
                  {selected.faceCount ? ` · ${formatCount(selected.faceCount)} faces` : ''}
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="secondary" size="sm" icon={<ArrowRight className="h-3.5 w-3.5" />} onClick={openInLibrary}>
                  View photographs
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-danger hover:bg-danger-soft hover:text-danger"
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  onClick={() => setRemoving(selected)}
                >
                  Remove person
                </Button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" hint="Press Enter or leave the field to save.">
                <TextInput
                  value={nameDraft}
                  onChange={(event) => setNameDraft(event.target.value)}
                  onBlur={() => void saveName()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void saveName();
                      (event.target as HTMLInputElement).blur();
                    }
                  }}
                  placeholder="Person's name"
                />
              </Field>
              <Field label="Role" hint="Roles help album categories and coverage suggestions.">
                <Select
                  value={selected.role}
                  onChange={(event) => void setPersonRole(selected.id, event.target.value as PersonRole)}
                >
                  {PERSON_ROLES.map((role) => (
                    <option key={role.id} value={role.id}>{role.label}</option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="rounded-xl border border-line p-4">
              <p className="flex items-center gap-2 text-[11.5px] font-medium text-ink">
                <GitMerge className="h-3.5 w-3.5 text-accent" /> Merge into another person
              </p>
              <p className="mt-1 text-[10.5px] leading-relaxed text-faint">
                Use this when the model split one person into two clusters. Faces move to the target person; nothing is deleted.
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Select value={mergeTarget} onChange={(event) => setMergeTarget(event.target.value)} className="flex-1">
                  <option value="">Choose a person…</option>
                  {people
                    .filter((person) => person.id !== selected.id)
                    .map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name} ({person.faceCount} faces)
                      </option>
                    ))}
                </Select>
                <Button variant="secondary" loading={busy} disabled={!mergeTarget} onClick={() => void openMerge()}>
                  Merge
                </Button>
              </div>
            </div>

            {selectedFaces.length ? (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">Face samples</p>
                  <span className="text-[10px] text-faint">{selectedFaces.length} of {selected.faceCount}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedFaces.map((face) => (
                    <FaceThumb key={face.id} photoId={face.photoId} faceId={face.id} />
                  ))}
                </div>
              </div>
            ) : null}

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">Photographs</p>
                <button type="button" onClick={openInLibrary} className="text-[10.5px] font-medium text-accent hover:underline">
                  Open in library
                </button>
              </div>
              {selectedPhotos.length ? (
                <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
                  {selectedPhotos.slice(0, 20).map((photo) => (
                    <PhotoThumb key={photo.id} photoId={photo.id} />
                  ))}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-[11px] text-faint">
                  No photographs currently show this person.
                </p>
              )}
              {selectedPhotos.length > 20 ? (
                <p className="mt-2 text-center text-[10px] text-faint">+{formatCount(selectedPhotos.length - 20)} more in the library</p>
              ) : null}
            </div>

            <div className="rounded-xl border border-line bg-raised/50 p-3 text-[10.5px] leading-relaxed text-faint">
              <p className="font-medium text-soft">Privacy</p>
              <p className="mt-1">
                This person is represented by numeric face descriptors stored in this browser. To remove all face data, use Settings → Privacy.
              </p>
            </div>
          </div>
        ) : null}
      </Drawer>

      <Modal
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title="Remove this person?"
        description="Their faces become unassigned and can be regrouped later. No photographs are deleted."
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRemoving(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (!removing) return;
                await removePerson(removing.id);
                setRemoving(null);
                setSelectedId(null);
              }}
            >
              Remove person
            </Button>
          </div>
        }
      >
        <div className="px-5 py-4 text-[12.5px] leading-relaxed text-soft">
          <p className="font-medium text-ink">{removing?.name}</p>
          <p className="mt-2">
            {formatCount(removing?.faceCount ?? 0)} faces will no longer be grouped. You can re-cluster them any time.
          </p>
        </div>
      </Modal>
    </div>
  );
}

function FaceThumb({ photoId, faceId }: { photoId: string; faceId: string }) {
  const url = useFaceUrl(photoId, faceId);
  return (
    <span className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-line bg-raised">
      {url ? (
        <img src={url} alt="Face sample" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <UserRound className="h-4 w-4 text-faint" />
      )}
    </span>
  );
}

function PhotoThumb({ photoId }: { photoId: string }) {
  const name = useAppStore((state) => state.photos.find((item) => item.id === photoId)?.name);
  const url = useThumbUrl(photoId);
  return (
    <span className="relative block aspect-square overflow-hidden rounded-lg border border-line bg-raised">
      {url ? (
        <img src={url} alt={name ?? 'Photograph'} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-faint">
          <UserRound className="h-4 w-4" />
        </span>
      )}
    </span>
  );
}
