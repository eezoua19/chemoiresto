import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ink-50 px-6 text-center">
      <span className="rounded-2xl bg-white p-4 text-ink-400 shadow-card">
        <Compass size={32} />
      </span>
      <h1 className="text-2xl font-bold text-ink-900">Page introuvable</h1>
      <p className="max-w-sm text-sm text-ink-500">
        Cette page n&apos;existe pas ou a ete deplacee. Si vous avez scanne un QR Code, demandez a
        une serveuse de verifier celui de votre table.
      </p>
      <Link to="/" className="btn-primary">
        Retour a l&apos;accueil
      </Link>
    </div>
  );
}
