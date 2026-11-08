import { useState, type ReactNode } from 'react';
import { FolderOpen, Plus } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { Button, EmptyState } from '@/components/ui';
import { NewProjectModal } from '@/components/NewProjectModal';

export function NoProjectState({ feature = 'this workspace' }: { feature?: string }) {
  const projects = useAppStore((state) => state.projects);
  const openProject = useAppStore((state) => state.openProject);
  const [creating, setCreating] = useState(false);

  return (
    <div className="mx-auto max-w-2xl py-16">
      <EmptyState
        icon={<FolderOpen className="h-5 w-5" />}
        title="Open a library to begin"
        description={`Ivory needs a project before it can show ${feature}. Create a private library for each wedding or event — nothing is uploaded anywhere.`}
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
              New library
            </Button>
            {projects.length ? (
              <Button
                variant="secondary"
                onClick={() => void openProject(projects[0].id)}
              >
                Open “{projects[0].name}”
              </Button>
            ) : null}
          </div>
        }
      />
      <NewProjectModal open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

export function ProjectGate({ children, feature }: { children: ReactNode; feature?: string }) {
  const project = useAppStore((state) => state.project);
  const loadingProject = useAppStore((state) => state.loadingProject);

  if (!project) {
    if (loadingProject) {
      return (
        <div className="flex items-center justify-center py-24 text-[12px] text-faint">Opening library…</div>
      );
    }
    return <NoProjectState feature={feature} />;
  }
  return <>{children}</>;
}
