import { useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutGrid,
  ClipboardList,
  BellRing,
  UtensilsCrossed,
  BadgeCheck,
  LogOut,
  ChefHat,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import useSocketEvent from '../hooks/useSocketEvent';
import useNotificationSound from '../hooks/useNotificationSound';
import useVoiceAnnouncer from '../hooks/useVoiceAnnouncer';
import { annonceCommande, annonceDemande, annonceRappel } from '../utils/announcements';
import { libelleProvenance } from '../utils/order';
import { Footer } from '../components/ui';
import NotificationBell from '../components/NotificationBell';
import { initials } from '../utils/format';
import { applyBrandColor } from '../utils/color';

const LINKS = [
  { to: '/serveuse/dashboard', label: 'Tableau', icon: LayoutGrid },
  { to: '/serveuse/commandes', label: 'Commandes', icon: ClipboardList },
  { to: '/serveuse/demandes', label: 'Demandes', icon: BellRing },
  { to: '/serveuse/carte', label: 'Carte', icon: UtensilsCrossed },
  { to: '/serveuse/abonnements', label: 'Abonnés', icon: BadgeCheck },
];

/** Interface de la serveuse : pensee pour un usage tablette / téléphone. */
export default function ServerLayout() {
  const { user, restaurant, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const playSound = useNotificationSound();
  const voice = useVoiceAnnouncer();

  useEffect(() => {
    applyBrandColor(restaurant?.primaryColor);
  }, [restaurant]);

  // Le signal sonore attire l'attention, la voix donne le détail, et l'alerte
  // reste à l'écran tant qu'elle n'a pas été fermee à la main.
  useSocketEvent('new_order', (order) => {
    playSound('order');
    voice.announce(annonceCommande(order));
    toast.alerte(
      `Nouvelle commande ${order.orderNumber} - ${libelleProvenance(order)}`,
      'info',
      voice.stop
    );
  });

  useSocketEvent('service_request', (request) => {
    playSound('call');
    voice.announce(annonceDemande(request));
    toast.alerte(
      `Table ${request.table?.number} : ${
        request.type === 'BILL' ? 'demande l\'addition' : 'appelle une serveuse'
      }`,
      'warning',
      voice.stop
    );
  });

  useSocketEvent('order_assigned', (order) => {
    toast.info(`La commande ${order.orderNumber} vous a été attribuée`);
  });


  // Un rappel veut dire que la table a deja attendu : meme alerte que l'appel
  // initial, mais annoncee comme un rappel pour qu'on l'entende differemment.
  useSocketEvent('service_request_reminder', (request) => {
    playSound('call');
    voice.announce(annonceRappel(request));
    toast.alerte(
      `Table ${request.table?.number} : rappel, ${
        request.type === 'BILL' ? "l'addition est toujours attendue" : "personne n'est venu"
      }`,
      'warning',
      voice.stop
    );
  });

  // Remise a zero decidee au bureau : l'ecran de la salle affiche encore des
  // commandes qui n'existent plus. On previent, puis on recharge.
  useSocketEvent('data_reset', () => {
    voice.stop();
    toast.warning("Les données ont été remises à zéro par l'administration", 6000);
    setTimeout(() => window.location.reload(), 2500);
  });

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col bg-ink-50">
      <header className="sticky top-0 z-30 border-b border-ink-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <span className="rounded-xl bg-brand-500 p-2 text-white">
            <ChefHat size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-ink-900">
              Bonjour {user?.firstName} <span className="font-normal">&#128075;</span>
            </p>
            <p className="truncate text-xs text-ink-500">{restaurant?.name}</p>
          </div>

          <NotificationBell />

          <span className="hidden h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700 sm:flex">
            {initials(user?.fullName)}
          </span>

          <button
            type="button"
            onClick={handleLogout}
            className="rounded-xl p-2.5 text-ink-500 transition hover:bg-red-50 hover:text-red-600"
            aria-label="Déconnexion"
          >
            <LogOut size={18} />
          </button>
        </div>

        {/* Navigation principale : onglets en haut sur grand écran */}
        <nav className="mx-auto hidden max-w-6xl gap-1 px-4 pb-2 sm:flex">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  isActive ? 'bg-brand-50 text-brand-700' : 'text-ink-600 hover:bg-ink-100'
                }`
              }
            >
              <link.icon size={16} />
              {link.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 pb-24 sm:pb-8">
        <Outlet />
      </main>

      <Footer className="pb-24 sm:pb-5" />

      {/* Navigation basse sur telephone */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-ink-100 bg-white/95 backdrop-blur sm:hidden">
        {LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition ${
                isActive ? 'text-brand-600' : 'text-ink-500'
              }`
            }
          >
            <link.icon size={20} />
            {link.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
