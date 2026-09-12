import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ShoppingBag,
  Bell,
  Receipt,
  CalendarX2,
  QrCode,
  MapPin,
  Phone,
  Clock,
  PartyPopper,
  ChevronRight,
} from 'lucide-react';
import { CartProvider, useCart } from '../../context/CartContext';
import { useToast } from '../../context/ToastContext';
import { publicApi } from '../../services/endpoints';
import { imageUrl } from '../../services/api';
import { connectSocket, getSocket } from '../../services/socket';
import useSocketEvent from '../../hooks/useSocketEvent';
import ProductCard from '../../components/client/ProductCard';
import ProductSheet from '../../components/client/ProductSheet';
import CartSheet from '../../components/client/CartSheet';
import OrderStatusTracker from '../../components/client/OrderStatusTracker';
import { Button, EmptyState, ErrorState, Modal, Skeleton } from '../../components/ui';
import { formatLongDate, formatMoney } from '../../utils/format';
import { ORDER_STATUS, ordersKey } from '../../utils/constants';
import { applyBrandColor } from '../../utils/color';

export default function ClientMenuPage() {
  const { token } = useParams();
  return (
    <CartProvider tableToken={token}>
      <ClientMenuContent token={token} />
    </CartProvider>
  );
}

function ClientMenuContent({ token }) {
  const toast = useToast();
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
      const response = await publicApi.getMenuByTable(token);
      setState({ loading: false, error: null, data: response.data });

      applyBrandColor(response.data.restaurant?.primaryColor);
      document.title = `${response.data.restaurant.name} - Table ${response.data.table.number}`;

      // Retire du panier ce qui n'est plus au menu.
      const removed = syncRef.current(response.data.menu?.items);
      if (removed.length) {
        toast.warning(`Retire du panier (indisponible) : ${removed.join(', ')}`);
      }
    } catch (error) {
      setState({ loading: false, error, data: null });
    }
  }, [token, toast]);

  useEffect(() => {
    load();
  }, [load]);

  // ------------------- Commandes en cours de la table -------------------
  const loadOrders = useCallback(async () => {
    try {
      const tableOrders = await publicApi.getTableOrders(token);
      // On n'affiche que les commandes passees depuis CE telephone.
      let mine = [];
      try {
        mine = JSON.parse(localStorage.getItem(ordersKey(token)) || '[]');
      } catch {
        mine = [];
      }
      setOrders(tableOrders.filter((order) => mine.includes(order.trackingToken)));
    } catch {
      // Sans commande en cours l'ecran reste simplement vide.
    }
  }, [token]);

  const loadRequests = useCallback(async () => {
    try {
      setRequests(await publicApi.getTableServiceRequests(token));
    } catch {
      setRequests([]);
    }
  }, [token]);

  useEffect(() => {
    loadOrders();
    loadRequests();
  }, [loadOrders, loadRequests]);

  // -------------------------- Temps reel --------------------------------
  useEffect(() => {
    const socket = connectSocket(null);
    const join = () => socket.emit('join_table', token);
    join();
    socket.on('connect', join);
    return () => socket.off('connect', join);
  }, [token]);

  useSocketEvent('order_status', (updated) => {
    // Seules les commandes passees depuis ce telephone declenchent une alerte.
    if (!ordersRef.current.some((order) => order.id === updated.id)) return;
    setOrders((current) => current.map((order) => (order.id === updated.id ? updated : order)));
    toast.success(
      `Commande ${updated.orderNumber} : ${ORDER_STATUS[updated.status].clientLabel.toLowerCase()}`
    );
  });

  useSocketEvent('service_request_updated', () => loadRequests());
  useSocketEvent('menu_updated', () => load());

  // --------------------------- Commande ---------------------------------
  const handleConfirmOrder = async ({ customerName, comment }) => {
    setSubmitting(true);
    try {
      const order = await publicApi.createOrder({
        tableToken: token,
        customerName: customerName || undefined,
        comment: comment || undefined,
        items: cart.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          note: item.note || undefined,
          optionValueIds: item.options.map((option) => option.id),
        })),
      });

      // Memorise la commande pour pouvoir la suivre depuis ce telephone.
      try {
        const saved = JSON.parse(localStorage.getItem(ordersKey(token)) || '[]');
        localStorage.setItem(ordersKey(token), JSON.stringify([...saved, order.trackingToken]));
      } catch {
        // Stockage indisponible : le suivi reste possible via le lien affiche.
      }

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
  if (state.loading) return <MenuSkeleton />;

  if (state.error) {
    const status = state.error.status;
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50 px-6">
        <div className="w-full max-w-sm">
          {status === 404 ? (
            <EmptyState
              icon={QrCode}
              title="QR Code invalide"
              description="Ce QR Code ne correspond a aucune table. Demandez a une serveuse de verifier celui pose sur votre table."
            />
          ) : status === 403 ? (
            <EmptyState
              icon={QrCode}
              title="Table indisponible"
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

  return (
    <div className="min-h-screen bg-ink-50 pb-28">
      {/* ------------------------- En-tete ------------------------- */}
      <header
        className="px-5 pb-6 pt-8 text-white"
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
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold">{restaurant.name}</h1>
              <p className="text-sm text-white/80">{restaurant.welcomeMessage || 'Bienvenue !'}</p>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between rounded-2xl bg-white/15 px-4 py-3 backdrop-blur">
            <div>
              <p className="text-xs uppercase tracking-wide text-white/70">Vous etes a la</p>
              <p className="text-2xl font-extrabold">TABLE {table.number}</p>
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

      <div className="mx-auto max-w-2xl px-4">
        {/* ------------------ Commandes en cours ------------------ */}
        {activeOrders.length > 0 && (
          <section className="-mt-4 space-y-3">
            {activeOrders.map((order) => (
              <div key={order.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                      Commande en cours
                    </p>
                    <p className="font-bold text-ink-900">{order.orderNumber}</p>
                  </div>
                  <span className={`badge ${ORDER_STATUS[order.status].badge}`}>
                    {ORDER_STATUS[order.status].clientLabel}
                  </span>
                </div>

                <div className="mt-3">
                  <OrderStatusTracker order={order} compact />
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-ink-900">
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

        {/* --------------------- Appels serveuse ------------------- */}
        <section className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => sendServiceRequest('CALL_SERVER')}
            disabled={requestPending === 'CALL_SERVER'}
            className={`flex flex-col items-center gap-1.5 rounded-2xl border px-3 py-4 text-sm font-semibold transition
              ${openCall ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-ink-200 bg-white text-ink-700 hover:border-amber-300 hover:bg-amber-50'}`}
          >
            <Bell size={20} />
            {openCall ? 'Serveuse appelee' : 'Appeler une serveuse'}
          </button>

          <button
            type="button"
            onClick={() => sendServiceRequest('BILL')}
            disabled={requestPending === 'BILL'}
            className={`flex flex-col items-center gap-1.5 rounded-2xl border px-3 py-4 text-sm font-semibold transition
              ${openBill ? 'border-sky-300 bg-sky-50 text-sky-700' : 'border-ink-200 bg-white text-ink-700 hover:border-sky-300 hover:bg-sky-50'}`}
          >
            <Receipt size={20} />
            {openBill ? 'Addition demandee' : 'Demander l\'addition'}
          </button>
        </section>

        {/* ------------------------ Le menu ------------------------ */}
        {!menu ? (
          <div className="card mt-6">
            <EmptyState
              icon={CalendarX2}
              title="Le menu du jour n'est pas encore disponible"
              description="Le restaurant n'a pas encore publie le menu de cette journee. Appelez une serveuse ou reessayez dans un instant."
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
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-500">
                  Les plats du jour
                </h2>
                <div className="space-y-3">
                  {dishesOfDay.map((item) => (
                    <ProductCard
                      key={item.id}
                      item={item}
                      currency={currency}
                      onSelect={setSelectedItem}
                    />
                  ))}
                </div>
              </section>
            )}

            <div className="sticky top-0 z-20 -mx-4 mt-6 bg-ink-50/95 px-4 py-3 backdrop-blur">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {categories.map((category) => {
                  const isActive = activeCategory === (category.id === 'all' ? 'all' : category.id);
                  return (
                    <button
                      key={category.slug}
                      type="button"
                      onClick={() => setActiveCategory(category.id === 'all' ? 'all' : category.id)}
                      className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
                        isActive ? 'text-white' : 'border border-ink-200 bg-white text-ink-600'
                      }`}
                      style={isActive ? { backgroundColor: 'var(--brand)' } : undefined}
                    >
                      {category.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <section className="mt-2 space-y-3">
              {visibleItems.length === 0 ? (
                <div className="card">
                  <EmptyState title="Aucun plat dans cette categorie" description="Choisissez une autre categorie." />
                </div>
              ) : (
                visibleItems.map((item) => (
                  <ProductCard key={item.id} item={item} currency={currency} onSelect={setSelectedItem} />
                ))
              )}
            </section>
          </>
        )}
      </div>

      {/* ---------------------- Panier flottant ---------------------- */}
      {cart.count > 0 && (
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 px-4 pt-3">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 rounded-2xl px-5 py-4 text-white shadow-float transition active:scale-[0.99]"
            style={{ backgroundColor: 'var(--brand)' }}
          >
            <span className="flex items-center gap-2.5">
              <span className="relative">
                <ShoppingBag size={20} />
                <span className="absolute -right-2 -top-2 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-white px-1 text-[11px] font-bold text-ink-900">
                  {cart.count}
                </span>
              </span>
              <span className="font-semibold">Voir le panier</span>
            </span>
            <span className="font-bold">{formatMoney(cart.total, currency)}</span>
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
          toast.success(`${item.name} ajoute au panier`);
        }}
      />

      <CartSheet
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        currency={currency}
        tableNumber={table.number}
        onConfirm={handleConfirmOrder}
        submitting={submitting}
      />

      {/* ------------------- Confirmation de commande ---------------- */}
      <Modal
        open={Boolean(confirmation)}
        onClose={() => setConfirmation(null)}
        title="Commande envoyee !"
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
            <span className="mx-auto mb-3 inline-flex rounded-2xl bg-emerald-50 p-3 text-emerald-600">
              <PartyPopper size={28} />
            </span>
            <p className="text-sm text-ink-600">Votre commande a bien ete transmise a la serveuse.</p>
            <p className="mt-4 text-lg font-bold text-ink-900">{confirmation.orderNumber}</p>
            <p className="text-sm text-ink-500">Table {table.number}</p>
            <p className="mt-2 text-xl font-extrabold" style={{ color: 'var(--brand)' }}>
              {formatMoney(confirmation.total, currency)}
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}

/** Squelette de chargement, calque sur la mise en page reelle. */
function MenuSkeleton() {
  return (
    <div className="min-h-screen bg-ink-50">
      <div className="bg-ink-200 px-5 pb-6 pt-8">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center gap-3">
            <Skeleton className="h-12 w-12 rounded-xl bg-white/40" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40 bg-white/40" />
              <Skeleton className="h-3 w-56 bg-white/30" />
            </div>
          </div>
          <Skeleton className="mt-5 h-20 w-full rounded-2xl bg-white/30" />
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-3 px-4 pt-6">
        <div className="flex gap-2">
          {[1, 2, 3, 4].map((index) => (
            <Skeleton key={index} className="h-9 w-24 rounded-full" />
          ))}
        </div>
        {[1, 2, 3, 4, 5].map((index) => (
          <Skeleton key={index} className="h-28 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
