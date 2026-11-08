import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAppStore } from '@/store/appStore';
import { AppShell } from '@/components/layout/AppShell';
import { DashboardPage } from '@/pages/DashboardPage';
import { ImportPage } from '@/pages/ImportPage';
import { LibraryPage } from '@/pages/LibraryPage';
import { ReviewPage } from '@/pages/ReviewPage';
import { PeoplePage } from '@/pages/PeoplePage';
import { TimelinePage } from '@/pages/TimelinePage';
import { SearchPage } from '@/pages/SearchPage';
import { ComparePage } from '@/pages/ComparePage';
import { AlbumPage } from '@/pages/AlbumPage';
import { AlbumPreviewPage } from '@/pages/AlbumPreviewPage';
import { ExportPage } from '@/pages/ExportPage';
import { SettingsPage } from '@/pages/SettingsPage';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);
  return null;
}

function BootScreen({ error }: { error?: string | null }) {
  return (
    <div className="noise flex min-h-screen flex-col items-center justify-center gap-6 bg-canvas px-6">
      <div className="flex flex-col items-center gap-4">
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-line bg-surface shadow-soft">
          <span className="display text-3xl text-accent">I</span>
        </div>
        <div className="text-center">
          <p className="display text-2xl text-ink">Ivory</p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.22em] text-faint">Private photo curation</p>
        </div>
      </div>
      {error ? (
        <div className="max-w-md rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-center text-[12.5px] leading-relaxed text-danger">
          {error}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-[12px] text-faint">
          <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-accent" />
          Opening your local library…
        </div>
      )}
    </div>
  );
}

export default function App() {
  const booted = useAppStore((state) => state.booted);
  const bootError = useAppStore((state) => state.bootError);
  const bootstrap = useAppStore((state) => state.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (!booted) return <BootScreen error={bootError} />;

  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/people" element={<PeoplePage />} />
          <Route path="/timeline" element={<TimelinePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/compare" element={<ComparePage />} />
          <Route path="/album" element={<AlbumPage />} />
          <Route path="/album/preview" element={<AlbumPreviewPage />} />
          <Route path="/export" element={<ExportPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  );
}
