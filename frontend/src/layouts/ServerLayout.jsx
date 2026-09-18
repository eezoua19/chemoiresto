import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutGrid,
  ClipboardList,
  BellRing,
  UtensilsCrossed,
  BadgeCheck,
  LogOut,
  ChefHat,
  Gift,
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
import PushSubscribeToggle from '../components/PushSubscribeToggle';
import ThemeToggle from '../components/ThemeToggle';
import { serviceRequestApi } from '../services/endpoints';
import { SERVICE_REQUEST_STATUS } from '../utils/constants';
import { initials } from '../utils/format';
import { applyBrandColor } from '../utils/color';

const LINKS = [
  { to: '/serveuse/dashboard', label: 'Tableau', icon: LayoutGrid },
  { to: '/serveuse/commandes', label: 'Commandes', icon: ClipboardList },
  { to: '/serveuse/demandes', label: 'Demandes', icon: BellRing },
  { to: '/serveuse/carte', label: 'Carte', icon: UtensilsCrossed },
  { to: '/serveuse/abonnements', label: 'Abonnés', icon: BadgeCheck },
];

const LOYALTY_LINK = { to: '/serveuse/fidelite', label: 'Fidélité', icon: Gift };

/** Interface de la serveuse : pensee pour un usage tablette / téléphone. */
export default function ServerLayout() {
  const { user, restaurant, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const playSound = useNotificationSound();
  const voice = useVoiceAnnouncer();
  // Compteur de demandes ouvertes, visible depuis n'importe quel écran (pastille
  // sur le lien "Demandes") - meme principe que les ruptures cote admin.
  const [demandeIds, setDemandeIds] = useState(() => new Set());

  useEffect(() => {
    applyBrandColor(restaurant?.primaryColor);
  }, [restaurant]);

  // Etat initial de la pastille : les evenements temps reel ne couvrent que
  // ce qui change APRES l'ouverture de la session.
  useEffect(() => {
    serviceRequestApi
      .list({ open: 'true' })
      .then((demandes) => setDemandeIds(new Set(demandes.map((d) => d.id))))
      .catch(() => {});
  }, []);

  // Meme regle que cote admin : la serveuse valide les recompenses en salle,
  // mais l'onglet n'a aucune raison d'exister si le programme est desactive.
  const links = restaurant?.loyaltyEnabled ? [...LINKS, LOYALTY_LINK] : LINKS;

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
    setDemandeIds((current) => new Set(current).add(request.id));
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

  // Prise en charge, cloture ou annulation : la pastille ne compte que ce qui
  // reste reellement a traiter.
  useSocketEvent('service_request_updated', (request) => {
    setDemandeIds((current) => {
      const suivant = new Set(current);
      if (SERVICE_REQUEST_STATUS[request.status]?.next) suivant.add(request.id);
      else suivant.delete(request.id);
      return suivant;
    });
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
    <div className="flex min-h-screen flex-col bg-ink-50 dark:bg-ink-900">
      <header className="sticky top-0 z-30 border-b border-ink-100 dark:border-ink-700 bg-white/95 dark:bg-ink-800/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <span className="rounded-xl bg-brand-500 p-2 text-white">
            <ChefHat size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-ink-900 dark:text-ink-50">
              Bonjour {user?.firstName} <span className="font-normal">&#128075;</span>
            </p>
            <p className="truncate text-xs text-ink-500 dark:text-ink-400">{restaurant?.name}</p>
          </div>

          <ThemeToggle />
          <PushSubscribeToggle />
          <NotificationBell />

          <span className="hidden h-9 w-9 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-900/40 text-sm font-bold text-brand-700 sm:flex">
            {initials(user?.fullName)}
          </span>

          <button
            type="button"
            onClick={handleLogout}
            className="rounded-xl p-2.5 text-ink-500 dark:text-ink-400 transition hover:bg-red-50 hover:text-red-600"
            aria-label="Déconnexion"
          >
            <LogOut size={18} />
          </button>
        </div>

        {/* Navigation principale : onglets en haut sur grand écran */}
        <nav className="mx-auto hidden max-w-6xl gap-1 px-4 pb-2 sm:flex">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  isActive ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700' : 'text-ink-600 dark:text-ink-300 hover:bg-ink-100 dark:hover:bg-ink-700'
                }`
              }
            >
              <link.icon size={16} />
              {link.label}
              {link.to === '/serveuse/demandes' && demandeIds.size > 0 && (
                <span
                  key={demandeIds.size}
                  className="ml-auto flex h-5 min-w-5 animate-pop items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white"
                >
                  {demandeIds.size}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 pb-24 sm:pb-8">
        <Outlet />
      </main>

      <Footer className="pb-24 sm:pb-5" />

      {/* Navigation basse sur telephone */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-ink-100 dark:border-ink-700 bg-white/95 dark:bg-ink-800/95 backdrop-blur sm:hidden">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition ${
                isActive ? 'text-brand-600' : 'text-ink-500 dark:text-ink-400'
              }`
            }
          >
            <span className="relative">
              <link.icon size={20} />
              {link.to === '/serveuse/demandes' && demandeIds.size > 0 && (
                <span
                  key={demandeIds.size}
                  className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 animate-pop items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white"
                >
                  {demandeIds.size}
                </span>
              )}
            </span>
            {link.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
