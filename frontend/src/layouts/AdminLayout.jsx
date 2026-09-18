import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingBag,
  CalendarDays,
  UtensilsCrossed,
  Tags,
  Table2,
  QrCode,
  Users,
  History,
  BadgeCheck,
  BarChart3,
  CalendarCheck,
  ScrollText,
  DatabaseBackup,
  Settings,
  LogOut,
  Menu as MenuIcon,
  X,
  ChefHat,
  Gift,
  Star,
  AlertTriangle,
  Tag,
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
import { productApi } from '../services/endpoints';
import { initials } from '../utils/format';
import { applyBrandColor } from '../utils/color';

const LINKS = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/commandes', label: 'Commandes', icon: ShoppingBag },
  { to: '/admin/menus', label: 'Menus', icon: CalendarDays },
  { to: '/admin/produits', label: 'Produits', icon: UtensilsCrossed },
  { to: '/admin/ruptures', label: 'Ruptures', icon: AlertTriangle },
  { to: '/admin/categories', label: 'Catégories', icon: Tags },
  { to: '/admin/tables', label: 'Tables', icon: Table2 },
  { to: '/admin/qrcodes', label: 'QR Codes', icon: QrCode },
  { to: '/admin/serveuses', label: 'Serveuses', icon: Users },
  { to: '/admin/abonnements', label: 'Abonnements', icon: BadgeCheck },
  { to: '/admin/codes-promo', label: 'Codes promo', icon: Tag },
  // Fidélité : insérée dynamiquement, uniquement si activée (voir Paramètres).
  { to: '/admin/avis', label: 'Avis', icon: Star },
  { to: '/admin/historique', label: 'Historique', icon: History },
  { to: '/admin/statistiques', label: 'Statistiques', icon: BarChart3 },
  { to: '/admin/clotures', label: 'Clôtures', icon: CalendarCheck },
  { to: '/admin/journal', label: 'Journal', icon: ScrollText },
  { to: '/admin/sauvegardes', label: 'Sauvegardes', icon: DatabaseBackup },
  { to: '/admin/parametres', label: 'Paramètres', icon: Settings },
];

const LOYALTY_LINK = { to: '/admin/fidelite', label: 'Fidélité', icon: Gift };

export default function AdminLayout() {
  const { user, restaurant, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const playSound = useNotificationSound();
  const voice = useVoiceAnnouncer();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Compteur global de ruptures, visible depuis n'importe quel écran (pastille
  // sur le lien "Ruptures"), pas seulement quand la page dédiée est ouverte.
  const [ruptureIds, setRuptureIds] = useState(() => new Set());

  // Le lien "Fidélité" n'apparaît que si le programme est activé dans les
  // paramètres : inutile de montrer un onglet vide à un restaurant qui ne
  // l'utilise pas.
  const links = (() => {
    if (!restaurant?.loyaltyEnabled) return LINKS;
    const apres = LINKS.findIndex((link) => link.to === '/admin/abonnements') + 1;
    return [...LINKS.slice(0, apres), LOYALTY_LINK, ...LINKS.slice(apres)];
  })();

  // Applique la couleur du restaurant à toute l'interface.
  useEffect(() => {
    applyBrandColor(restaurant?.primaryColor);
  }, [restaurant]);

  useEffect(() => setSidebarOpen(false), [location.pathname]);

  // Etat initial de la pastille : les evenements temps reel ne couvrent que
  // ce qui change APRES l'ouverture de la session.
  useEffect(() => {
    productApi
      .list({ available: false })
      .then((produits) => setRuptureIds(new Set(produits.map((p) => p.id))))
      .catch(() => {});
  }, []);

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

  // Une rupture declaree en salle : moins urgent qu'un appel client (pas de
  // voix), mais l'admin doit le savoir meme sans avoir la page Produits
  // ouverte - un signal sonore distinct des deux autres, pour ne pas le
  // confondre avec une nouvelle commande ou un appel.
  useSocketEvent('product_availability', (changement) => {
    setRuptureIds((current) => {
      const suivant = new Set(current);
      if (changement.isAvailable) suivant.delete(changement.id);
      else suivant.add(changement.id);
      return suivant;
    });

    if (changement.isAvailable) {
      toast.success(`${changement.name} est de nouveau disponible`);
    } else {
      playSound('rupture');
      toast.warning(`${changement.name} : rupture déclarée en salle`);
    }
  });

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="rounded-xl bg-brand-500 p-2 text-white">
          <ChefHat size={20} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-ink-900 dark:text-ink-50">
            {restaurant?.name || 'Restaurant'}
          </p>
          <p className="text-xs text-ink-500 dark:text-ink-400">Administration</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}
          >
            <link.icon size={18} />
            {link.label}
            {link.to === '/admin/ruptures' && ruptureIds.size > 0 && (
              <span
                key={ruptureIds.size}
                className="ml-auto flex h-5 min-w-5 animate-pop items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white"
              >
                {ruptureIds.size}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-ink-100 dark:border-ink-700 p-3">
        <div className="mb-2 flex items-center gap-3 rounded-xl px-3 py-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-900/40 text-sm font-bold text-brand-700 dark:text-brand-300">
            {initials(user?.fullName)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink-900 dark:text-ink-50">{user?.fullName}</p>
            <p className="truncate text-xs text-ink-500 dark:text-ink-400">Administrateur</p>
          </div>
        </div>
        <button type="button" onClick={handleLogout} className="sidebar-link w-full text-red-600 hover:bg-red-50">
          <LogOut size={18} />
          Déconnexion
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-ink-50 dark:bg-ink-900">
      {/* Barre laterale fixe sur grand écran */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-800 lg:block">
        {sidebar}
      </aside>

      {/* Tiroir mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink-900/50" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 animate-slide-up bg-white dark:bg-ink-800 shadow-float">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-ink-100 dark:border-ink-700 bg-white/90 dark:bg-ink-800/90 px-4 py-3 backdrop-blur">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="rounded-xl p-2 text-ink-600 dark:text-ink-300 transition hover:bg-ink-100 dark:hover:bg-ink-700 lg:hidden"
            aria-label="Ouvrir le menu"
          >
            {sidebarOpen ? <X size={20} /> : <MenuIcon size={20} />}
          </button>

          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <PushSubscribeToggle />
            <NotificationBell />
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>

        <Footer />
      </div>
    </div>
  );
}
