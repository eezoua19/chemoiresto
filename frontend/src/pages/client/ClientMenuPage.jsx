import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ShoppingBag,
  Bell,
  BellRing,
  Receipt,
  CalendarX2,
  QrCode,
  Star,
  MapPin,
  Phone,
  Clock,
  PartyPopper,
  ChevronRight,
  History,
  Sun,
  Moon,
} from 'lucide-react';
import { CartProvider, useCart } from '../../context/CartContext';
import { useToast } from '../../context/ToastContext';
import { useTheme } from '../../context/ThemeContext';
import { publicApi } from '../../services/endpoints';
import { imageUrl } from '../../services/api';
import { getSocket } from '../../services/socket';
import useSocketEvent from '../../hooks/useSocketEvent';
import useSocketRoom from '../../hooks/useSocketRoom';
import ProductCard from '../../components/client/ProductCard';
import ChargementGourmand from '../../components/client/ChargementGourmand';
import ChiffresQuiRoulent from '../../components/client/ChiffresQuiRoulent';
import ProductSheet from '../../components/client/ProductSheet';
import CartSheet from '../../components/client/CartSheet';
import OrderStatusTracker from '../../components/client/OrderStatusTracker';
import TempsDAttente from '../../components/client/TempsDAttente';
import { Button, EmptyState, ErrorState, Footer, Modal } from '../../components/ui';
import { formatLongDate, formatMoney } from '../../utils/format';
import { ORDER_STATUS, ordersKey } from '../../utils/constants';
import { enregistrerCommande } from '../../utils/orderHistory';
import { applyBrandColor } from '../../utils/color';

/** Le client peut relancer 90 s apres son appel, trois fois au plus. */
const RAPPEL_DELAI_MS = 90000;
const RAPPEL_MAX = 3;

/**
 * Ou en est le droit de rappel pour une demande ouverte.
 *
 * Le serveur reste seul juge : ce calcul ne sert qu'a griser le bouton et a
 * afficher l'attente. S'il se trompe d'une seconde, c'est le serveur qui
 * repond, pas l'ecran.
 */
function etatDuRappel(demande, maintenant) {
  if (!demande) return null;
  const nombre = demande.reminderCount || 0;
  if (nombre >= RAPPEL_MAX) return { possible: false, epuise: true, nombre, secondes: 0 };
  const dernierSignal = new Date(demande.lastReminderAt || demande.createdAt).getTime();
  const secondes = Math.max(0, Math.ceil((dernierSignal + RAPPEL_DELAI_MS - maintenant) / 1000));
  return { possible: secondes === 0, epuise: false, nombre, secondes };
}

/**
 * Le même écran sert les deux parcours :
 *   - service "DINE_IN"   : le client a scanne le QR Code de sa table
 *   - service "TAKEAWAY"  : il a scanne l'affiche du comptoir et emporte
 * Seuls le point d'entrée, l'en-tete et les boutons d'appel different.
 */
export default function ClientMenuPage({ service = 'DINE_IN' }) {
  const { token } = useParams();
  return (
    <CartProvider tableToken={token}>
      <ClientMenuContent token={token} service={service} />
    </CartProvider>
  );
}

function ClientMenuContent({ token, service }) {
  const emporter = service === 'TAKEAWAY';
  const toast = useToast();
  const { isDark, toggleTheme } = useTheme();
  const cart = useCart();

  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [activeCategory, setActiveCategory] = useState('all');
  const [selectedItem, setSelectedItem] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [orders, setOrders] = useState([]);
  const [requests, setRequests] = useState([]);
  const [requestPending, setRequestPending] = useState(null);
  const syncRef = useRef(cart.syncWithMenu);
  syncRef.current = cart.syncWithMenu;
  const ordersRef = useRef(orders);
  ordersRef.current = orders;

  // -------------------- Chargement du menu du jour ----------------------
  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const response = emporter
        ? await publicApi.getTakeawayMenu(token)
        : await publicApi.getMenuByTable(token);
      setState({ loading: false, error: null, data: response.data });

      applyBrandColor(response.data.restaurant?.primaryColor);
      document.title = `${response.data.restaurant.name} - ${
        emporter ? 'À emporter' : `Table ${response.data.table.number}`
      }`;

      // Retire du panier ce qui n'est plus au menu.
      const removed = syncRef.current(response.data.menu?.items);
      if (removed.length) {
        toast.warning(`Retiré du panier (indisponible) : ${removed.join(', ')}`);
      }
    } catch (error) {
      setState({ loading: false, error, data: null });
    }
  }, [token, emporter, toast]);

  useEffect(() => {
    load();
  }, [load]);

  // ------------------- Commandes en cours de la table -------------------
  const loadOrders = useCallback(async () => {
    // À emporter il n'y a pas de table a interroger : les commandes passees
    // depuis ce téléphone restent affichées en memoire après l'envoi.
    if (emporter) return;
    try {
      const tableOrders = await publicApi.getTableOrders(token);
      // On n'affiche que les commandes passees depuis CE téléphone.
      let mine = [];
      try {
        mine = JSON.parse(localStorage.getItem(ordersKey(token)) || '[]');
      } catch {
        mine = [];
      }
      setOrders(tableOrders.filter((order) => mine.includes(order.trackingToken)));
    } catch {
      // Sans commande en cours l'écran reste simplement vide.
    }
  }, [token, emporter]);

  const loadRequests = useCallback(async () => {
    if (emporter) return;
    try {
      setRequests(await publicApi.getTableServiceRequests(token));
    } catch {
      setRequests([]);
    }
  }, [token, emporter]);

  useEffect(() => {
    loadOrders();
    loadRequests();
  }, [loadOrders, loadRequests]);

  // -------------------------- Temps réel --------------------------------
  // Le salon d'une table n'existe que pour le service en salle. À emporter,
  // le suivi passe par le salon de la commande (track_order).
  useSocketRoom('join_table', emporter ? null : token);

  useSocketEvent('order_status', (updated) => {
    // Seules les commandes passees depuis ce téléphone declenchent une alerte.
    if (!ordersRef.current.some((order) => order.id === updated.id)) return;
    setOrders((current) => current.map((order) => (order.id === updated.id ? updated : order)));
    toast.success(
      `Commande ${updated.orderNumber} : ${ORDER_STATUS[updated.status].clientLabel.toLowerCase()}`
    );
  });

  useSocketEvent('service_request_updated', () => loadRequests());

  // ----------------------- En-tete qui se replie ------------------------
  // Deux seuils au lieu d'un : avec un seul, un doigt qui hesite autour de la
  // limite ferait clignoter la barre.
  const enteteRef = useRef(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    let image = null;
    const surDefilement = () => {
      if (image) return;
      image = requestAnimationFrame(() => {
        image = null;
        const y = window.scrollY;
        setCompact((actuel) => (actuel ? y > 110 : y > 170));
        // Le motif suit le defilement au quart de sa vitesse.
        enteteRef.current?.style.setProperty('--decalage-motif', `${Math.round(y * 0.25)}px`);
      });
    };

    window.addEventListener('scroll', surDefilement, { passive: true });
    return () => {
      window.removeEventListener('scroll', surDefilement);
      if (image) cancelAnimationFrame(image);
    };
  }, []);

  // --------------------- Pastille de categorie ---------------------------
  // Elle glisse d'un onglet a l'autre : on mesure l'onglet actif et on
  // deplace un seul element, plutot que d'allumer et d'eteindre des fonds.
  const ongletsRef = useRef(null);
  const [pastille, setPastille] = useState(null);

  useEffect(() => {
    const piste = ongletsRef.current;
    if (!piste) return undefined;

    const mesurer = () => {
      const actif = piste.querySelector('[data-actif="true"]');
      if (!actif) return;
      setPastille({ left: actif.offsetLeft, width: actif.offsetWidth });
      // L'onglet choisi doit rester visible quand la liste deborde.
      actif.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    };

    mesurer();
    window.addEventListener('resize', mesurer);
    return () => window.removeEventListener('resize', mesurer);
  }, [activeCategory, state.data]);

  // Horloge locale : elle ne sert qu'a reactiver le bouton « Rappeler » au bon
  // moment. Elle ne tourne que s'il y a une demande en cours, pour ne pas
  // reveiller le telephone du client pendant tout son repas.
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    if (requests.length === 0) return undefined;
    const minuteur = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(minuteur);
  }, [requests.length]);
  useSocketEvent('menu_updated', () => load());

  // --------------------------- Commande ---------------------------------
  const handleConfirmOrder = async ({ customerName, customerPhone, comment, promoCode }) => {
    setSubmitting(true);
    try {
      const order = await publicApi.createOrder({
        ...(emporter ? { takeawayToken: token } : { tableToken: token }),
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        comment: comment || undefined,
        promoCode: promoCode || undefined,
        items: cart.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          note: item.note || undefined,
          optionValueIds: item.options.map((option) => option.id),
        })),
      });

      // Memorise la commande pour pouvoir la suivre depuis ce téléphone.
      try {
        const saved = JSON.parse(localStorage.getItem(ordersKey(token)) || '[]');
        localStorage.setItem(ordersKey(token), JSON.stringify([...saved, order.trackingToken]));
      } catch {
        // Stockage indisponible : le suivi reste possible via le lien affiche.
      }

      // Et dans l'historique global, "Mes commandes" : celui-ci traverse les
      // visites et les restaurants, contrairement au suivi ci-dessus qui ne
      // sert qu'a cette table pour cette journee.
      enregistrerCommande({
        trackingToken: order.trackingToken,
        orderNumber: order.orderNumber,
        restaurantName: state.data.restaurant.name,
        type: order.type,
        tableLabel: emporter ? null : `Table ${state.data.table.number}`,
        total: order.total,
        currency: order.currency,
        status: order.status,
        createdAt: order.createdAt,
      });

      const socket = getSocket();
      socket.emit('track_order', order.trackingToken);

      cart.clear();
      setCartOpen(false);
      setConfirmation(order);
      setOrders((current) => [order, ...current]);
    } catch (error) {
      toast.error(error.message);
      if (error.status === 400) load();
    } finally {
      setSubmitting(false);
    }
  };

  // ------------------------ Demandes de service -------------------------
  const sendReminder = async (type) => {
    setRequestPending(type);
    try {
      const response = await publicApi.remindServiceRequest({ tableToken: token, type });
      toast.success(response.message);
      loadRequests();
    } catch (error) {
      toast.error(error.message);
      // 404 : la demande vient d'etre traitee ailleurs, l'ecran est en retard.
      if (error.status === 404) loadRequests();
    } finally {
      setRequestPending(null);
    }
  };

  const sendServiceRequest = async (type) => {
    setRequestPending(type);
    try {
      const response = await publicApi.createServiceRequest({ tableToken: token, type });
      toast.success(response.message);
      loadRequests();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setRequestPending(null);
    }
  };

  // ---------------------------- Rendu -----------------------------------
  if (state.loading) return <ChargementGourmand />;

  if (state.error) {
    const status = state.error.status;
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50 dark:bg-ink-900 px-6">
        <div className="w-full max-w-sm">
          {status === 404 ? (
            <EmptyState
              icon={QrCode}
              title="QR Code invalide"
              description={
                emporter
                  ? 'Ce QR Code n\'est plus valable. Demandez l\'affiche à jour au comptoir.'
                  : 'Ce QR Code ne correspond à aucune table. Demandez à une serveuse de vérifier celui posé sur votre table.'
              }
            />
          ) : status === 403 ? (
            <EmptyState
              icon={QrCode}
              title={emporter ? 'Commandes à emporter fermées' : 'Table indisponible'}
              description={state.error.message}
            />
          ) : (
            <ErrorState message={state.error.message} onRetry={load} isNetwork={state.error.isNetwork} />
          )}
        </div>
      </div>
    );
  }

  const { restaurant, table, menu, date } = state.data;
  const currency = restaurant.currency;

  const categories = menu
    ? [{ id: 'all', name: 'Tous', slug: 'all' }, ...menu.categories]
    : [];

  const visibleItems = menu
    ? menu.items.filter(
        (item) => activeCategory === 'all' || item.category?.id === activeCategory
      )
    : [];

  const dishesOfDay = menu ? menu.items.filter((item) => item.isDishOfDay) : [];
  const activeOrders = orders.filter((order) => !['SERVED', 'CANCELLED'].includes(order.status));
  const openCall = requests.find((request) => request.type === 'CALL_SERVER');
  const openBill = requests.find((request) => request.type === 'BILL');
  const rappelCall = etatDuRappel(openCall, maintenant);
  const rappelBill = etatDuRappel(openBill, maintenant);

  return (
    <div className="min-h-screen bg-ink-50 dark:bg-ink-900 pb-28">
      {/* ------------------------- En-tete ------------------------- */}
      {/* Le motif de couverts donne une texture de maison : sans lui,
          l'en-tete est un aplat de couleur qui pourrait etre n'importe quoi. */}
      <header
        ref={enteteRef}
        className="motif-cuisine px-5 pb-6 pt-8 text-white"
        style={{ background: 'linear-gradient(160deg, var(--brand) 0%, var(--brand-dark) 100%)' }}
      >
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center gap-3">
            {restaurant.logo ? (
              <img
                src={imageUrl(restaurant.logo)}
                alt={restaurant.name}
                className="h-12 w-12 rounded-xl bg-white/20 object-cover"
              />
            ) : (
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 text-lg font-bold">
                {restaurant.name.slice(0, 2).toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-bold">{restaurant.name}</h1>
              <p className="text-sm text-white/80">{restaurant.welcomeMessage || 'Bienvenue !'}</p>
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white transition hover:bg-white/25"
              title={isDark ? 'Mode clair' : 'Mode sombre'}
              aria-label={isDark ? 'Activer le mode clair' : 'Activer le mode sombre'}
            >
              {isDark ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <Link
              to="/mes-commandes"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white transition hover:bg-white/25"
              title="Mes commandes"
              aria-label="Mes commandes"
            >
              <History size={19} />
            </Link>
          </div>

          <div className="mt-5 flex animate-entree items-center justify-between rounded-2xl bg-white/15 px-4 py-3 backdrop-blur">
            <div>
              <p className="text-xs uppercase tracking-wide text-white/70">
                {emporter ? 'Votre commande' : 'Vous êtes à la'}
              </p>
              {/* "À EMPORTER" est long : sans nowrap il se coupe apres le "A"
                  sur un telephone etroit. */}
              <p className={`font-extrabold ${emporter ? 'whitespace-nowrap text-xl' : 'text-2xl'}`}>
                {emporter ? 'À EMPORTER' : `TABLE ${table.number}`}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-white/70">Menu du</p>
              <p className="text-sm font-semibold capitalize">{formatLongDate(date)}</p>
            </div>
          </div>

          {(restaurant.address || restaurant.phone || restaurant.openingHours) && (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/75">
              {restaurant.address && (
                <span className="inline-flex items-center gap-1">
                  <MapPin size={12} /> {restaurant.address}
                </span>
              )}
              {restaurant.phone && (
                <span className="inline-flex items-center gap-1">
                  <Phone size={12} /> {restaurant.phone}
                </span>
              )}
              {restaurant.openingHours && (
                <span className="inline-flex items-center gap-1">
                  <Clock size={12} /> {restaurant.openingHours}
                </span>
              )}
            </div>
          )}
        </div>
      </header>

      {/* --------- En-tete compact : apparait quand on descend --------- */}
      <div
        className={`fixed inset-x-0 top-0 z-40 text-white shadow-float transition-transform duration-300 ${
          compact ? 'translate-y-0' : '-translate-y-full'
        }`}
        style={{ background: 'linear-gradient(160deg, var(--brand) 0%, var(--brand-dark) 100%)' }}
      >
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/20 text-xs font-bold">
            {restaurant.name.slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold leading-tight">{restaurant.name}</p>
            <p className="truncate text-xs text-white/75">
              {emporter ? 'À emporter' : `Table ${table.number}`}
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4">
        {/* ------------------ Commandes en cours ------------------ */}
        {activeOrders.length > 0 && (
          <section className="-mt-4 space-y-3">
            {activeOrders.map((order) => (
              <div key={order.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">
                      Commande en cours
                    </p>
                    <p className="font-bold text-ink-900 dark:text-ink-50">{order.orderNumber}</p>
                  </div>
                  <span className={`badge ${ORDER_STATUS[order.status].badge}`}>
                    {ORDER_STATUS[order.status].clientLabel}
                  </span>
                </div>

                <div className="mt-3">
                  <OrderStatusTracker order={order} compact />
                </div>

                {order.estimatedReadyAt && (
                  <div className="mt-3">
                    <TempsDAttente order={order} />
                  </div>
                )}

                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-ink-900 dark:text-ink-50">
                    {formatMoney(order.total, currency)}
                  </span>
                  <Link
                    to={`/commande/${order.trackingToken}`}
                    className="inline-flex items-center gap-0.5 text-sm font-semibold"
                    style={{ color: 'var(--brand)' }}
                  >
                    Suivre <ChevronRight size={15} />
                  </Link>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* ------------------ Rappel du retrait au comptoir ------------------ */}
        {emporter && (
          <section className="mt-5 rounded-2xl border border-brand-200 bg-brand-50 dark:bg-brand-900/30 px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-brand-800 dark:text-brand-300">
              <ShoppingBag size={16} /> Commande à emporter
            </p>
            <p className="mt-1 text-xs text-brand-900/70 dark:text-brand-300/80">
              Vous recevrez un code de retrait. Présentez-le au comptoir pour récupérer votre
              commande et regler.
            </p>
          </section>
        )}

        {/* --------------------- Appels serveuse ------------------- */}
        {!emporter && (
        <section className="mt-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => sendServiceRequest('CALL_SERVER')}
              disabled={requestPending === 'CALL_SERVER'}
              className={`flex flex-col items-center gap-1.5 rounded-2xl border px-3 py-4 text-sm font-semibold transition
                ${openCall ? 'border-amber-300 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400' : 'border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800 text-ink-700 dark:text-ink-200 hover:border-amber-300 hover:bg-amber-50'}`}
            >
              <Bell size={20} />
              {openCall ? 'Serveuse appelée' : 'Appeler une serveuse'}
            </button>

            <button
              type="button"
              onClick={() => sendServiceRequest('BILL')}
              disabled={requestPending === 'BILL'}
              className={`flex flex-col items-center gap-1.5 rounded-2xl border px-3 py-4 text-sm font-semibold transition
                ${openBill ? 'border-sky-300 bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-400' : 'border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800 text-ink-700 dark:text-ink-200 hover:border-sky-300 hover:bg-sky-50'}`}
            >
              <Receipt size={20} />
              {openBill ? 'Addition demandée' : "Demander l'addition"}
            </button>
          </div>

          {/* ------ Rappel : personne n'est venu depuis l'appel ------ */}
          <RappelBouton
            etat={rappelCall}
            libelle="Rappeler la serveuse"
            attente="Une serveuse arrive"
            occupe={requestPending === 'CALL_SERVER'}
            onRappel={() => sendReminder('CALL_SERVER')}
          />
          <RappelBouton
            etat={rappelBill}
            libelle="Relancer pour l'addition"
            attente="Votre addition est en préparation"
            occupe={requestPending === 'BILL'}
            onRappel={() => sendReminder('BILL')}
          />
        </section>
        )}

        {/* ------------------------ Le menu ------------------------ */}
        {!menu ? (
          <div className="card mt-6">
            <EmptyState
              icon={CalendarX2}
              title="Le menu du jour n'est pas encore disponible"
              description="Le restaurant n'a pas encore publié le menu de cette journée. Appelez une serveuse ou réessayez dans un instant."
              action={
                <Button variant="secondary" onClick={load}>
                  Actualiser
                </Button>
              }
            />
          </div>
        ) : (
          <>
            {dishesOfDay.length > 0 && activeCategory === 'all' && (
              <section className="mt-6">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-500 dark:text-ink-400">
                  <Star size={14} className="fill-amber-400 text-amber-400" />
                  Les plats du jour
                </h2>
                <div className="space-y-3">
                  {dishesOfDay.map((item, index) => (
                    <ProductCard
                      key={item.id}
                      item={item}
                      index={index}
                      currency={currency}
                      onSelect={setSelectedItem}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* La barre descend quand l'en-tete compact apparait, pour ne
                pas passer dessous. */}
            <div
              className="sticky z-20 -mx-4 mt-6 bg-ink-50/95 dark:bg-ink-900/95 px-4 py-3 backdrop-blur transition-[top] duration-300"
              style={{ top: compact ? 56 : 0 }}
            >
              <div className="overflow-x-auto pb-1">
                <div
                  ref={ongletsRef}
                  className="relative inline-flex gap-1 rounded-full border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800 p-1"
                >
                  {/* Un seul fond, qui se deplace. Rien ne s'allume ni ne
                      s'eteint : c'est ce glissement qui rend la barre vivante. */}
                  {pastille && (
                    <span
                      aria-hidden
                      className="absolute top-1 rounded-full transition-all duration-300"
                      style={{
                        left: pastille.left,
                        width: pastille.width,
                        height: 'calc(100% - 0.5rem)',
                        backgroundColor: 'var(--brand)',
                        transitionTimingFunction: 'cubic-bezier(0.3, 1.2, 0.4, 1)',
                      }}
                    />
                  )}

                  {categories.map((category) => {
                    const isActive = activeCategory === (category.id === 'all' ? 'all' : category.id);
                    return (
                      <button
                        key={category.slug}
                        type="button"
                        data-actif={isActive}
                        onClick={() => setActiveCategory(category.id === 'all' ? 'all' : category.id)}
                        className={`relative z-10 shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                          isActive ? 'text-white' : 'text-ink-600 dark:text-ink-300'
                        }`}
                      >
                        {category.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* La cle change avec la categorie : les plats se redressent a
                chaque filtrage, au lieu d'etre remplaces sans un geste. */}
            <section key={activeCategory} className="mt-2 space-y-3">
              {visibleItems.length === 0 ? (
                <div className="card">
                  <EmptyState title="Aucun plat dans cette catégorie" description="Choisissez une autre catégorie." />
                </div>
              ) : (
                visibleItems.map((item, index) => (
                  <ProductCard
                    key={item.id}
                    item={item}
                    index={index}
                    currency={currency}
                    onSelect={setSelectedItem}
                  />
                ))
              )}
            </section>
          </>
        )}
      </div>

      {/* ---------------------- Panier flottant ---------------------- */}
      {cart.count > 0 && (
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 animate-slide-up px-4 pt-3">
          <button
            id="barre-panier"
            type="button"
            onClick={() => setCartOpen(true)}
            className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 rounded-2xl px-5 py-4 text-white shadow-float transition active:scale-[0.99]"
            style={{ backgroundColor: 'var(--brand)' }}
          >
            <span className="flex items-center gap-2.5">
              <span className="relative">
                <ShoppingBag size={20} />
                {/* La cle force le rebond a chaque changement : sur un
                    telephone, un chiffre qui change sans bouger passe inapercu. */}
                <span
                  key={cart.count}
                  className="absolute -right-2 -top-2 flex h-5 min-w-[20px] animate-pop items-center justify-center rounded-full bg-white dark:bg-ink-800 px-1 text-[11px] font-bold text-ink-900 dark:text-ink-50"
                >
                  {cart.count}
                </span>
              </span>
              <span className="font-semibold">Voir le panier</span>
            </span>
            <ChiffresQuiRoulent className="font-bold" valeur={formatMoney(cart.total, currency)} />
          </button>
        </div>
      )}

      <ProductSheet
        item={selectedItem}
        currency={currency}
        open={Boolean(selectedItem)}
        onClose={() => setSelectedItem(null)}
        onAdd={(item, options) => {
          cart.addItem(item, options);
          toast.success(`${item.name} ajouté au panier`);
        }}
      />

      <CartSheet
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        currency={currency}
        destination={emporter ? 'À emporter' : `Table ${table.number}`}
        token={token}
        takeaway={emporter}
        loyaltyEnabled={restaurant.loyaltyEnabled}
        onConfirm={handleConfirmOrder}
        submitting={submitting}
      />

      {/* ------------------- Confirmation de commande ---------------- */}
      <Modal
        open={Boolean(confirmation)}
        onClose={() => setConfirmation(null)}
        title="Commande envoyée !"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmation(null)}>
              Continuer
            </Button>
            {confirmation && (
              <Link to={`/commande/${confirmation.trackingToken}`} className="btn-primary">
                Suivre ma commande
              </Link>
            )}
          </>
        }
      >
        {confirmation && (
          <div className="text-center">
            <span className="mx-auto mb-3 inline-flex animate-pop rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 p-3 text-emerald-600">
              <PartyPopper size={28} />
            </span>
            <p className="text-sm text-ink-600 dark:text-ink-300">
              {emporter
                ? 'Votre commande est partie en cuisine. Gardez ce code, il vous sera demande au comptoir.'
                : 'Votre commande a bien été transmise à la serveuse.'}
            </p>

            {emporter && confirmation.pickupCode && (
              <div className="mt-4 rounded-2xl border border-brand-200 bg-brand-50 dark:bg-brand-900/30 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
                  Votre code de retrait
                </p>
                <p className="text-4xl font-extrabold tracking-widest text-brand-800 dark:text-brand-200">
                  {confirmation.pickupCode}
                </p>
              </div>
            )}

            <p className="mt-4 text-lg font-bold text-ink-900 dark:text-ink-50">{confirmation.orderNumber}</p>
            <p className="text-sm text-ink-500 dark:text-ink-400">
              {emporter ? 'À emporter' : `Table ${table.number}`}
            </p>
            <p className="mt-2 text-xl font-extrabold" style={{ color: 'var(--brand)' }}>
              {formatMoney(confirmation.total, currency)}
            </p>
          </div>
        )}
      </Modal>

      <Footer />
    </div>
  );
}

/**
 * Bouton de rappel, affiché seulement quand une demande est déjà en cours.
 *
 * Tant que le délai n'est pas passé, on n'affiche pas un bouton grisé sans
 * explication : on dit au client que la serveuse arrive et dans combien de
 * temps il pourra relancer. C'est ce qui évite qu'il appuie dix fois.
 */
function RappelBouton({ etat, libelle, attente, occupe, onRappel }) {
  if (!etat) return null;

  if (etat.epuise) {
    return (
      <p className="rounded-2xl border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800 px-4 py-3 text-center text-xs text-ink-500 dark:text-ink-400">
        Le personnel a été relancé {etat.nombre} fois. Si personne ne vient, adressez-vous au
        comptoir.
      </p>
    );
  }

  if (!etat.possible) {
    return (
      <p className="rounded-2xl border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800 px-4 py-3 text-center text-xs text-ink-500 dark:text-ink-400">
        {attente}. Vous pourrez relancer dans {etat.secondes}&nbsp;s.
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={onRappel}
      disabled={occupe}
      className="flex w-full items-center justify-center gap-2 rounded-2xl border border-amber-400 bg-amber-100 px-4 py-3 text-sm font-bold text-amber-800 dark:text-amber-300 transition hover:bg-amber-200 disabled:opacity-60"
    >
      <BellRing size={18} />
      {libelle}
      {etat.nombre > 0 && (
        <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
          (déjà relancé {etat.nombre} fois)
        </span>
      )}
    </button>
  );
}
