import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Footer } from '../components/ui';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ink-50 dark:bg-ink-900 px-6 text-center">
      <span className="rounded-2xl bg-white dark:bg-ink-800 p-4 text-ink-400 dark:text-ink-500 shadow-card">
        <Compass size={32} />
      </span>
      <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-50">Page introuvable</h1>
      <p className="max-w-sm text-sm text-ink-500 dark:text-ink-400">
        Cette page n&apos;existe pas ou a été déplacée. Si vous avez scanné un QR Code, demandez a
        une serveuse de vérifier celui de votre table.
      </p>
      <Link to="/" className="btn-primary">
        Retour a l&apos;accueil
      </Link>

      <Footer className="mt-6" />
    </div>
  );
}
