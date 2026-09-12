import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  Copy,
  Trash2,
  Star,
  Search,
  CalendarDays,
  GripVertical,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { menuApi, productApi } from '../../services/endpoints';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  Skeleton,
  Toggle,
} from '../../components/ui';
import { formatLongDate, formatMoney, todayString } from '../../utils/format';

/**
 * Editeur du menu d'une journee.
 * Chaque ligne peut avoir son prix du jour, sa description et son etat
 * "plat du jour" ; le prix laisse vide reprend le prix de base du produit.
 */
export default function AdminMenuEditorPage() {
  const { date } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { restaurant } = useAuth();

  const [menu, setMenu] = useState(null);
  const [products, setProducts] = useState([]);
  const [items, setItems] = useState([]);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [isPublished, setIsPublished] = useState(true);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateDate, setDuplicateDate] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);

  const currency = restaurant?.currency || 'FCFA';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [menuResult, productList] = await Promise.all([
        menuApi.byDate(date),
        productApi.list({ active: 'true' }),
      ]);

      setProducts(productList);
      setMenu(menuResult.menu);

      if (menuResult.menu) {
        setTitle(menuResult.menu.title || '');
        setNote(menuResult.menu.note || '');
        setIsPublished(menuResult.menu.isPublished);
        setItems(
          menuResult.menu.items.map((item) => ({
            productId: item.productId,
            name: item.product?.name || 'Produit supprime',
            basePrice: item.product?.basePrice ?? 0,
            price: item.price ?? '',
            description: item.description || '',
            isAvailable: item.isAvailable,
            isDishOfDay: item.isDishOfDay,
          }))
        );
      } else {
        setTitle('');
        setNote('');
        setIsPublished(true);
        setItems([]);
      }
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedIds = useMemo(() => new Set(items.map((item) => item.productId)), [items]);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter(
      (product) => !term || product.name.toLowerCase().includes(term)
    );
  }, [products, search]);

  const toggleProduct = (product) => {
    setItems((current) => {
      if (current.some((item) => item.productId === product.id)) {
        return current.filter((item) => item.productId !== product.id);
      }
      return [
        ...current,
        {
          productId: product.id,
          name: product.name,
          basePrice: product.basePrice,
          price: '',
          description: '',
          isAvailable: true,
          isDishOfDay: false,
        },
      ];
    });
  };

  const updateItem = (productId, patch) => {
    setItems((current) =>
      current.map((item) => (item.productId === productId ? { ...item, ...patch } : item))
    );
  };

  const move = (index, delta) => {
    setItems((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const save = async () => {
    if (items.length === 0) {
      toast.warning('Ajoutez au moins un produit au menu');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: title.trim() || null,
        note: note.trim() || null,
        isPublished,
        items: items.map((item, index) => ({
          productId: item.productId,
          price: item.price === '' || item.price === null ? null : Number(item.price),
          description: item.description.trim() || null,
          isAvailable: item.isAvailable,
          isDishOfDay: item.isDishOfDay,
          sortOrder: index,
        })),
      };

      if (menu) {
        await menuApi.update(menu.id, payload);
        toast.success('Menu mis a jour');
      } else {
        await menuApi.create({ ...payload, date });
        toast.success('Menu cree');
      }
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const duplicate = async () => {
    if (!duplicateDate) return;
    setSaving(true);
    try {
      const response = await menuApi.duplicate(menu.id, { targetDate: duplicateDate, overwrite: false });
      toast.success(response.message);
      setDuplicateOpen(false);
      navigate(`/admin/menus/${duplicateDate}`);
    } catch (err) {
      if (err.status === 409) {
        // eslint-disable-next-line no-alert
        const confirmed = window.confirm(`${err.message}\n\nVoulez-vous remplacer le menu existant ?`);
        if (confirmed) {
          try {
            const response = await menuApi.duplicate(menu.id, {
              targetDate: duplicateDate,
              overwrite: true,
            });
            toast.success(response.message);
            setDuplicateOpen(false);
            navigate(`/admin/menus/${duplicateDate}`);
          } catch (retryError) {
            toast.error(retryError.message);
          }
        }
      } else {
        toast.error(err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await menuApi.remove(menu.id);
      toast.success('Menu supprime');
      setDeleteOpen(false);
      navigate('/admin/menus');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  if (error) return <ErrorState message={error.message} onRetry={load} isNetwork={error.isNetwork} />;

  const isPast = date < todayString();

  return (
    <div>
      <div className="mb-5">
        <Link
          to="/admin/menus"
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800"
        >
          <ArrowLeft size={16} /> Calendrier des menus
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-white p-2.5 text-brand-600 shadow-card">
              <CalendarDays size={22} />
            </span>
            <div>
              <h1 className="text-xl font-bold capitalize text-ink-900 sm:text-2xl">
                {formatLongDate(date)}
              </h1>
              <p className="mt-0.5 text-sm text-ink-500">
                {menu ? `${items.length} produit(s) au menu` : 'Aucun menu pour cette date'}
                {isPast && ' - date passee'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {menu && (
              <>
                <Button variant="secondary" icon={Copy} onClick={() => setDuplicateOpen(true)}>
                  Copier vers...
                </Button>
                <Button
                  variant="ghost"
                  icon={Trash2}
                  className="text-red-600 hover:bg-red-50"
                  onClick={() => setDeleteOpen(true)}
                >
                  Supprimer
                </Button>
              </>
            )}
            <Button icon={Save} onClick={save} loading={saving}>
              {menu ? 'Enregistrer' : 'Creer le menu'}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* ------------------ Colonne gauche : reglages ----------------- */}
        <Card className="h-fit xl:col-span-1">
          <CardHeader title="Informations" />
          <div className="space-y-4 p-5">
            <Field label="Titre du menu" hint="Ex : Menu du jour, Special week-end">
              <Input
                value={title}
                maxLength={120}
                placeholder="Menu du jour"
                onChange={(event) => setTitle(event.target.value)}
              />
            </Field>

            <Field label="Note interne" hint="Non visible par le client">
              <Input
                value={note}
                maxLength={1000}
                placeholder="Ex : arrivage poisson frais"
                onChange={(event) => setNote(event.target.value)}
              />
            </Field>

            <div className="rounded-xl bg-ink-50 p-4">
              <Toggle
                checked={isPublished}
                onChange={setIsPublished}
                label="Menu publie (visible par les clients)"
              />
              <p className="mt-2 text-xs text-ink-500">
                Un menu non publie reste modifiable sans etre visible par les clients qui scannent le
                QR Code.
              </p>
            </div>

            <Button variant="secondary" className="w-full" onClick={() => setPickerOpen(true)}>
              Ajouter des produits
            </Button>
          </div>
        </Card>

        {/* ------------------- Colonne droite : lignes ------------------ */}
        <Card className="xl:col-span-2">
          <CardHeader
            title="Produits du menu"
            subtitle="Prix vide = prix de base du produit"
            action={
              <span className="badge bg-ink-100 text-ink-600">{items.length} produit(s)</span>
            }
          />

          {items.length === 0 ? (
            <EmptyState
              title="Aucun produit dans ce menu"
              description="Ajoutez les plats proposes ce jour-la. Seuls ces produits pourront etre commandes."
              action={<Button onClick={() => setPickerOpen(true)}>Ajouter des produits</Button>}
            />
          ) : (
            <ul className="divide-y divide-ink-100">
              {items.map((item, index) => (
                <li key={item.productId} className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col items-center gap-1 pt-1 text-ink-300">
                      <button
                        type="button"
                        onClick={() => move(index, -1)}
                        disabled={index === 0}
                        className="rounded p-0.5 transition hover:bg-ink-100 hover:text-ink-600 disabled:opacity-30"
                        aria-label="Monter"
                      >
                        <ArrowUp size={14} />
                      </button>
                      <GripVertical size={14} />
                      <button
                        type="button"
                        onClick={() => move(index, 1)}
                        disabled={index === items.length - 1}
                        className="rounded p-0.5 transition hover:bg-ink-100 hover:text-ink-600 disabled:opacity-30"
                        aria-label="Descendre"
                      >
                        <ArrowDown size={14} />
                      </button>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-semibold text-ink-900">{item.name}</h3>
                        <button
                          type="button"
                          onClick={() => toggleProduct({ id: item.productId })}
                          className="rounded-lg p-1.5 text-ink-400 transition hover:bg-red-50 hover:text-red-600"
                          aria-label="Retirer du menu"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>

                      <p className="text-xs text-ink-500">
                        Prix de base : {formatMoney(item.basePrice, currency)}
                      </p>

                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <Field label={`Prix du jour (${currency})`}>
                          <Input
                            type="number"
                            min="0"
                            step="50"
                            placeholder={String(item.basePrice)}
                            value={item.price}
                            onChange={(event) =>
                              updateItem(item.productId, { price: event.target.value })
                            }
                          />
                        </Field>

                        <Field label="Description du jour">
                          <Input
                            placeholder="Optionnel"
                            maxLength={1000}
                            value={item.description}
                            onChange={(event) =>
                              updateItem(item.productId, { description: event.target.value })
                            }
                          />
                        </Field>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-5">
                        <Toggle
                          checked={item.isAvailable}
                          onChange={(value) => updateItem(item.productId, { isAvailable: value })}
                          label="Disponible"
                        />

                        <button
                          type="button"
                          onClick={() =>
                            updateItem(item.productId, { isDishOfDay: !item.isDishOfDay })
                          }
                          className={`badge transition ${
                            item.isDishOfDay
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-ink-100 text-ink-500 hover:bg-amber-50'
                          }`}
                        >
                          <Star size={12} className={item.isDishOfDay ? 'fill-amber-700' : ''} />
                          Plat du jour
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* --------------------- Selecteur de produits ------------------- */}
      <Modal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Choisir les produits"
        subtitle="Cochez les plats proposes ce jour-la"
        footer={<Button onClick={() => setPickerOpen(false)}>Terminer</Button>}
      >
        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <Input
            className="pl-9"
            placeholder="Rechercher un produit..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {filteredProducts.length === 0 ? (
          <EmptyState
            title="Aucun produit"
            description="Creez d'abord des produits dans la section Produits."
          />
        ) : (
          <div className="space-y-2">
            {filteredProducts.map((product) => {
              const checked = selectedIds.has(product.id);
              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => toggleProduct(product)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition
                    ${checked ? 'border-brand-400 bg-brand-50' : 'border-ink-200 hover:bg-ink-50'}`}
                >
                  <span className="flex items-center gap-3">
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition
                        ${checked ? 'border-brand-500 bg-brand-500' : 'border-ink-300'}`}
                    >
                      {checked && <span className="h-2 w-2 rounded-sm bg-white" />}
                    </span>
                    <span>
                      <span className="block text-sm font-medium text-ink-900">{product.name}</span>
                      <span className="block text-xs text-ink-500">
                        {product.category?.name || 'Sans categorie'}
                        {!product.isAvailable && ' - indisponible'}
                      </span>
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-ink-700">
                    {formatMoney(product.basePrice, currency)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </Modal>

      {/* ------------------------ Copie du menu ------------------------ */}
      <Modal
        open={duplicateOpen}
        onClose={() => setDuplicateOpen(false)}
        title="Copier ce menu"
        subtitle={`Source : ${formatLongDate(date)}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDuplicateOpen(false)}>
              Annuler
            </Button>
            <Button onClick={duplicate} loading={saving} disabled={!duplicateDate}>
              Copier
            </Button>
          </>
        }
      >
        <Field label="Date de destination" required>
          <Input
            type="date"
            value={duplicateDate}
            onChange={(event) => setDuplicateDate(event.target.value)}
          />
        </Field>
        <p className="mt-3 text-sm text-ink-500">
          Le menu source reste inchange. Vous pourrez ensuite modifier la copie librement.
        </p>
      </Modal>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={remove}
        title="Supprimer le menu"
        message={`Supprimer definitivement le menu du ${formatLongDate(date)} ? Les commandes deja passees ne sont pas affectees.`}
        confirmLabel="Supprimer"
        loading={saving}
      />
    </div>
  );
}
