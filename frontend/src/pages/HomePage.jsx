import { Link } from 'react-router-dom';
import { QrCode, ChefHat, Smartphone, Bell, ArrowRight, MapPin, Phone, Clock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Footer } from '../components/ui';

const STEPS = [
  { icon: QrCode, title: 'Scannez', text: 'Le QR Code posé sur la table identifie automatiquement votre place.' },
  { icon: Smartphone, title: 'Commandez', text: 'Consultez le menu du jour et composez votre commande depuis votre téléphone.' },
  { icon: Bell, title: 'Suivez', text: 'Acceptée, en préparation, prête, servie : suivez votre commande en direct.' },
];

const CONTACT = [
  { icon: MapPin, text: 'Rue Washington, Gare des Bâchées de Cocody, Abidjan' },
  { icon: Phone, text: '+225 01 43 97 00 00' },
  { icon: Clock, text: 'Lundi - Samedi : 11h - 19h' },
];

/** Page d'accueil : explique le principe et oriente le personnel vers /login. */
export default function HomePage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-b from-ink-900 to-ink-800">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2.5">
          <span className="rounded-xl bg-brand-500 p-2 text-white">
            <ChefHat size={20} />
          </span>
          <span className="font-bold text-white">Chémoiresto</span>
        </div>
        <Link
          to={user ? (user.role === 'ADMIN' ? '/admin/dashboard' : '/serveuse/dashboard') : '/login'}
          className="btn-primary"
        >
          {user ? 'Mon espace' : 'Espace professionnel'}
          <ArrowRight size={16} />
        </Link>
      </header>

      <main className="mx-auto max-w-5xl px-5 pb-20 pt-10 text-center">
        <h1 className="text-3xl font-extrabold leading-tight text-white sm:text-5xl">
          Chémoiresto,
          <br />
          <span className="text-brand-400">le menu du jour sur le téléphone du client.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-ink-300">
          Restaurant, cave et épicerie à Cocody (Abidjan) : confection de plats africains et traiteur
          événementiel. Chaque table possède son QR Code : le client scanne, découvre le menu du jour,
          commande, et la commande arrive instantanément chez la serveuse.
        </p>

        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          {STEPS.map((step) => (
            <div key={step.title} className="rounded-2xl border border-white/10 bg-white/5 p-6 text-left">
              <span className="inline-flex rounded-xl bg-brand-500/20 p-2.5 text-brand-300">
                <step.icon size={22} />
              </span>
              <h2 className="mt-4 text-lg font-semibold text-white">{step.title}</h2>
              <p className="mt-1.5 text-sm text-ink-300">{step.text}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-white/10 bg-white/5 p-6">
          <p className="text-sm text-ink-300">
            Vous êtes client ? Scannez le QR Code de votre table pour ouvrir le menu.
            <br className="hidden sm:block" /> Aucun compte, aucune application à installer.
          </p>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {CONTACT.map((item) => (
            <div
              key={item.text}
              className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm text-ink-300"
            >
              <item.icon size={16} className="shrink-0 text-brand-400" />
              {item.text}
            </div>
          ))}
        </div>
      </main>

      <Footer className="text-white/70" />
    </div>
  );
}
