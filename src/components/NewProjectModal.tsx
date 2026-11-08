import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store/appStore';
import { Button, Field, Modal, Switch, TextInput } from '@/components/ui';

export interface NewProjectModalProps {
  open: boolean;
  onClose: () => void;
}

export function NewProjectModal({ open, onClose }: NewProjectModalProps) {
  const createProject = useAppStore((state) => state.createProject);
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [coupleNames, setCoupleNames] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [venue, setVenue] = useState('');
  const [consentFace, setConsentFace] = useState(true);
  const [consentAiSearch, setConsentAiSearch] = useState(false);
  const [storeOriginals, setStoreOriginals] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName('');
    setCoupleNames('');
    setEventDate('');
    setVenue('');
    setConsentFace(true);
    setConsentAiSearch(false);
    setStoreOriginals(true);
    setBusy(false);
  }, [open]);

  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    const project = await createProject({
      name: name.trim(),
      coupleNames: coupleNames.trim() || undefined,
      eventDate: eventDate || undefined,
      venue: venue.trim() || undefined,
      consentFace,
      consentAiSearch,
      storeOriginals,
    });
    setBusy(false);
    if (project) {
      onClose();
      navigate('/import');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Begin a private library"
      description="Everything stays on this device. You can change every privacy choice later."
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="hidden text-[11px] text-faint sm:block">No accounts. No uploads. No subscriptions.</p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" loading={busy} disabled={!name.trim()} onClick={() => void submit()}>
              Create library
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5 px-5 py-5 sm:px-6">
        <Field label="Project name" hint="For example “Amelia & James — September wedding”.">
          <TextInput
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Wedding library"
            onKeyDown={(event) => {
              if (event.key === 'Enter') void submit();
            }}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Couple or event title" hint="Used for album covers and reports.">
            <TextInput value={coupleNames} onChange={(event) => setCoupleNames(event.target.value)} placeholder="Amelia & James" />
          </Field>
          <Field label="Event date">
            <TextInput type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} />
          </Field>
        </div>
        <Field label="Venue or location">
          <TextInput value={venue} onChange={(event) => setVenue(event.target.value)} placeholder="The Old Rectory, Somerset" />
        </Field>

        <div className="space-y-4 rounded-xl border border-line bg-raised/60 p-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-faint">Privacy & storage</p>
          <Switch
            checked={consentFace}
            onChange={setConsentFace}
            label="Group faces into private People albums"
            description="Runs the face model locally. Descriptors never leave your browser. You can delete them at any time."
          />
          <Switch
            checked={consentAiSearch}
            onChange={setConsentAiSearch}
            label="Enable optional visual search"
            description="Downloads a ~170 MB open-source CLIP model on first use. Local inference only; no photo is uploaded."
          />
          <Switch
            checked={storeOriginals}
            onChange={setStoreOriginals}
            label="Store full-resolution copies in this browser"
            description="Lets you export originals without relinking. Uses more disk space and is always reversible."
          />
        </div>
      </div>
    </Modal>
  );
}
