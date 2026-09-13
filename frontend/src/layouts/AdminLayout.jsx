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
  Settings,
  LogOut,
  Menu as MenuIcon,
  X,
  ChefHat,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import useSocketEvent from '../hooks/useSocketEvent';
import useNotificationSound from '../hooks/useNotificationSound';
import useVoiceAnnouncer from '../hooks/useVoiceAnnouncer';
import { annonceCommande, annonceDemande } from '../utils/announcements';
import { libelleProvenance } from '../utils/order';
import { Footer } from '../components/ui';
import NotificationBell from '../components/NotificationBell';
import { initials } from '../utils/format';
import { applyBrandColor } from '../utils/color';

const LINKS = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/commandes', label: 'Commandes', icon: ShoppingBag },
  { to: '/admin/menus', label: 'Menus', icon: CalendarDays },
  { to: '/admin/produits', label: 'Produits', icon: UtensilsCrossed },
  { to: '/admin/categories', label: 'Catégories', icon: Tags },
  { to: '/admin/tables', label: 'Tables', icon: Table2 },
  { to: '/admin/qrcodes', label: 'QR Codes', icon: QrCode },
  { to: '/admin/serveuses', label: 'Serveuses', icon: Users },
  { to: '/admin/abonnements', label: 'Abonnements', icon: BadgeCheck },
  { to: '/admin/historique', label: 'Historique', icon: History },
  { to: '/admin/statistiques', label: 'Statistiques', icon: BarChart3 },
  { to: '/admin/parametres', label: 'Paramètres', icon: Settings },
];

export default function AdminLayout() {
  const { user, restaurant, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const playSound = useNotificationSound();
  const voice = useVoiceAnnouncer();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Applique la couleur du restaurant à toute l'interface.
  useEffect(() => {
    applyBrandColor(restaurant?.primaryColor);
  }, [restaurant]);

  useEffect(() => setSidebarOpen(false), [location.pathname]);

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
          <p className="truncate text-sm font-bold text-ink-900">
            {restaurant?.name || 'Restaurant'}
          </p>
          <p className="text-xs text-ink-500">Administration</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}
          >
            <link.icon size={18} />
            {link.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-ink-100 p-3">
        <div className="mb-2 flex items-center gap-3 rounded-xl px-3 py-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
            {initials(user?.fullName)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink-900">{user?.fullName}</p>
            <p className="truncate text-xs text-ink-500">Administrateur</p>
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
    <div className="min-h-screen bg-ink-50">
      {/* Barre laterale fixe sur grand écran */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-ink-100 bg-white lg:block">
        {sidebar}
      </aside>

      {/* Tiroir mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink-900/50" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 animate-slide-up bg-white shadow-float">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-ink-100 bg-white/90 px-4 py-3 backdrop-blur">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="rounded-xl p-2 text-ink-600 transition hover:bg-ink-100 lg:hidden"
            aria-label="Ouvrir le menu"
          >
            {sidebarOpen ? <X size={20} /> : <MenuIcon size={20} />}
          </button>

          <div className="ml-auto flex items-center gap-1">
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
