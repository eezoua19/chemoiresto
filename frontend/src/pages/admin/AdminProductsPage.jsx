import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  UtensilsCrossed,
  Plus,
  Search,
  Pencil,
  Trash2,
  ImageOff,
  Camera,
  Upload,
  X,
  ListPlus,
  CalendarCheck,
  CalendarPlus,
  Check,
} from 'lucide-react';
import { categoryApi, productApi, menuApi } from '../../services/endpoints';
import { imageUrl } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import useSocketEvent from '../../hooks/useSocketEvent';
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Skeleton,
  Textarea,
  Toggle,
} from '../../components/ui';
import { formatMoney } from '../../utils/format';

const EMPTY_FORM = {
  name: '',
  description: '',
  basePrice: '',
  categoryId: '',
  isAvailable: true,
  isActive: true,
  options: [],
};

export default function AdminProductsPage() {
  const { restaurant } = useAuth();
  const toast = useToast();
  const currency = restaurant?.currency || 'FCFA';

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [todayMenuIds, setTodayMenuIds] = useState(new Set());
  const [todayBusy, setTodayBusy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  // Creation de catégorie à la volee depuis le formulaire produit
  const [newCategory, setNewCategory] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [addToTodayMenu, setAddToTodayMenu] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [productList, categoryList, todayMenu] = await Promise.all([
        productApi.list(),
        categoryApi.list(),
        menuApi.today(),
      ]);
      setProducts(productList);
      setCategories(categoryList);
      setTodayMenuIds(new Set((todayMenu.menu?.items || []).map((item) => item.productId)));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Une rupture declaree en salle par une serveuse doit apparaitre ici sans
  // qu'il faille recharger la page - meme evenement, meme logique que
  // ServerMenuPage.jsx.
  useSocketEvent('product_availability', (changement) => {
    setProducts((current) =>
      current.map((product) =>
        product.id === changement.id ? { ...product, isAvailable: changement.isAvailable } : product
      )
    );
  });

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter((product) => {
      if (categoryFilter && String(product.categoryId) !== categoryFilter) return false;
      return !term || product.name.toLowerCase().includes(term);
    });
  }, [products, search, categoryFilter]);

  // ------------------------- Formulaire ---------------------------------
  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setImageFile(null);
    setImagePreview(null);
    setRemoveImage(false);
    setNewCategory('');
    setAddToTodayMenu(true);
    setModalOpen(true);
  };

  const openEdit = (product) => {
    setEditing(product);
    setForm({
      name: product.name,
      description: product.description || '',
      basePrice: String(product.basePrice),
      categoryId: product.categoryId ? String(product.categoryId) : '',
      isAvailable: product.isAvailable,
      isActive: product.isActive,
      options: product.options.map((option) => ({
        name: option.name,
        type: option.type,
        isRequired: option.isRequired,
        values: option.values.map((value) => ({
          name: value.name,
          priceDelta: String(value.priceDelta),
        })),
      })),
    });
    setImageFile(null);
    setImagePreview(product.image ? imageUrl(product.image) : null);
    setRemoveImage(false);
    setNewCategory('');
    setAddToTodayMenu(todayMenuIds.has(product.id));
    setModalOpen(true);
  };

  /** Crée une catégorie sans quitter le formulaire produit. */
  const createCategoryInline = async () => {
    const name = newCategory.trim();
    if (name.length < 2) return;

    setCreatingCategory(true);
    try {
      const category = await categoryApi.create({ name });
      setCategories((current) => [...current, { ...category, productCount: 0 }]);
      setForm((current) => ({ ...current, categoryId: String(category.id) }));
      setNewCategory('');
      toast.success(`Catégorie "${category.name}" créée`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreatingCategory(false);
    }
  };

  /** Met un plat au menu du jour (ou l'en retire) en un clic. */
  const toggleTodayMenu = async (product) => {
    setTodayBusy(product.id);
    try {
      if (todayMenuIds.has(product.id)) {
        await menuApi.removeProductFromToday(product.id);
        setTodayMenuIds((current) => {
          const next = new Set(current);
          next.delete(product.id);
          return next;
        });
        toast.info(`"${product.name}" retire du menu du jour`);
      } else {
        const response = await menuApi.addProductToToday(product.id);
        setTodayMenuIds((current) => new Set(current).add(product.id));
        toast.success(response.message);
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setTodayBusy(null);
    }
  };

  const pickImage = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image trop volumineuse (5 Mo maximum)');
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setRemoveImage(false);
  };

  const addOptionGroup = () => {
    setForm((current) => ({
      ...current,
      options: [
        ...current.options,
        { name: '', type: 'SINGLE', isRequired: false, values: [{ name: '', priceDelta: '0' }] },
      ],
    }));
  };

  const updateOptionGroup = (index, patch) => {
    setForm((current) => ({
      ...current,
      options: current.options.map((group, i) => (i === index ? { ...group, ...patch } : group)),
    }));
  };

  const removeOptionGroup = (index) => {
    setForm((current) => ({
      ...current,
      options: current.options.filter((_, i) => i !== index),
    }));
  };

  const updateOptionValue = (groupIndex, valueIndex, patch) => {
    setForm((current) => ({
      ...current,
      options: current.options.map((group, i) =>
        i !== groupIndex
          ? group
          : {
              ...group,
              values: group.values.map((value, j) =>
                j === valueIndex ? { ...value, ...patch } : value
              ),
            }
      ),
    }));
  };

  const addOptionValue = (groupIndex) => {
    setForm((current) => ({
      ...current,
      options: current.options.map((group, i) =>
        i === groupIndex ? { ...group, values: [...group.values, { name: '', priceDelta: '0' }] } : group
      ),
    }));
  };

  const removeOptionValue = (groupIndex, valueIndex) => {
    setForm((current) => ({
      ...current,
      options: current.options.map((group, i) =>
        i === groupIndex
          ? { ...group, values: group.values.filter((_, j) => j !== valueIndex) }
          : group
      ),
    }));
  };

  const submit = async (event) => {
    event.preventDefault();

    const cleanedOptions = form.options
      .map((group) => ({
        name: group.name.trim(),
        type: group.type,
        isRequired: group.isRequired,
        values: group.values
          .filter((value) => value.name.trim())
          .map((value, index) => ({
            name: value.name.trim(),
            priceDelta: Number(value.priceDelta) || 0,
            sortOrder: index,
          })),
      }))
      .filter((group) => group.name && group.values.length > 0);

    const formData = new FormData();
    formData.append('name', form.name.trim());
    formData.append('description', form.description.trim());
    formData.append('basePrice', form.basePrice);
    if (form.categoryId) formData.append('categoryId', form.categoryId);
    formData.append('isAvailable', String(form.isAvailable));
    formData.append('isActive', String(form.isActive));
    formData.append('options', JSON.stringify(cleanedOptions));
    if (imageFile) formData.append('image', imageFile);
    if (removeImage) formData.append('removeImage', 'true');

    setSaving(true);
    try {
      const product = editing
        ? await productApi.update(editing.id, formData)
        : await productApi.create(formData);

      // Met immédiatement le plat au menu du jour (ou l'en retire) selon le choix.
      const alreadyInMenu = todayMenuIds.has(product.id);
      if (addToTodayMenu && !alreadyInMenu) {
        await menuApi.addProductToToday(product.id);
      } else if (!addToTodayMenu && alreadyInMenu) {
        await menuApi.removeProductFromToday(product.id);
      }

      toast.success(
        editing
          ? 'Produit mis à jour'
          : addToTodayMenu
            ? `"${product.name}" est créé et déjà commandable par les clients`
            : `"${product.name}" est créé (pas encore au menu du jour)`
      );

      setModalOpen(false);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleAvailability = async (product) => {
    try {
      const updated = await productApi.toggleAvailability(product.id);
      setProducts((current) => current.map((p) => (p.id === updated.id ? updated : p)));
      toast.success(updated.isAvailable ? `${updated.name} est disponible` : `${updated.name} est indisponible`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      const response = await productApi.remove(deleteTarget.id);
      toast.success(response.message);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((index) => (
            <Skeleton key={index} className="h-40 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error) return <ErrorState message={error.message} onRetry={load} isNetwork={error.isNetwork} />;

  return (
    <div>
      <PageHeader
        title="Produits"
        subtitle={`${products.length} produit(s) au catalogue`}
        icon={UtensilsCrossed}
        action={
          <Button icon={Plus} onClick={openCreate}>
            Nouveau produit
          </Button>
        }
      />

      <div className="card mb-5 grid gap-3 p-4 sm:grid-cols-2">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <Input
            className="pl-9"
            placeholder="Rechercher un produit..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
          <option value="">Toutes les catégories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={UtensilsCrossed}
            title={products.length === 0 ? 'Aucun produit' : 'Aucun résultat'}
            description={
              products.length === 0
                ? 'Créez vos premiers plats : ils pourront ensuite être ajoutés aux menus quotidiens.'
                : 'Modifiez votre recherche ou le filtre de catégorie.'
            }
            action={products.length === 0 && <Button onClick={openCreate}>Créer un produit</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((product) => (
            <Card key={product.id} className="overflow-hidden">
              <div className="flex gap-3 p-3">
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-ink-100">
                  {product.image ? (
                    <img
                      src={imageUrl(product.image)}
                      alt={product.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-ink-300">
                      <ImageOff size={20} />
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="truncate font-semibold text-ink-900">{product.name}</h3>
                    {!product.isActive && <span className="badge bg-ink-100 text-ink-500">Archive</span>}
                  </div>
                  <p className="text-xs text-ink-500">{product.category?.name || 'Sans catégorie'}</p>
                  <p className="mt-1 font-bold text-ink-900">
                    {formatMoney(product.basePrice, currency)}
                  </p>
                  {product.options.length > 0 && (
                    <p className="mt-0.5 text-xs text-ink-400">
                      {product.options.length} groupe(s) d&apos;options
                    </p>
                  )}
                </div>
              </div>

              {/* Mise au menu du jour : c'est ce qui rend le plat commandable */}
              <button
                type="button"
                onClick={() => toggleTodayMenu(product)}
                disabled={todayBusy === product.id || !product.isActive}
                className={`flex w-full items-center justify-center gap-2 border-t px-3 py-2 text-xs font-semibold transition disabled:opacity-50
                  ${
                    todayMenuIds.has(product.id)
                      ? 'border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      : 'border-ink-100 bg-white text-ink-500 hover:bg-ink-50'
                  }`}
              >
                {todayMenuIds.has(product.id) ? (
                  <>
                    <CalendarCheck size={14} /> Au menu du jour
                  </>
                ) : (
                  <>
                    <CalendarPlus size={14} /> Mettre au menu du jour
                  </>
                )}
              </button>

              <div className="flex items-center justify-between gap-2 border-t border-ink-100 px-3 py-2.5">
                <Toggle
                  checked={product.isAvailable}
                  onChange={() => toggleAvailability(product)}
                  label={product.isAvailable ? 'Disponible' : 'Indisponible'}
                />
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => openEdit(product)}
                    className="rounded-lg p-2 text-ink-500 transition hover:bg-ink-100 hover:text-ink-800"
                    aria-label="Modifier"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(product)}
                    className="rounded-lg p-2 text-ink-400 transition hover:bg-red-50 hover:text-red-600"
                    aria-label="Supprimer"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ------------------------- Formulaire -------------------------- */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Modifier le produit' : 'Nouveau produit'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Annuler
            </Button>
            <Button type="submit" form="product-form" loading={saving}>
              {editing ? 'Enregistrer' : 'Créer'}
            </Button>
          </>
        }
      >
        <form id="product-form" onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nom du produit" required>
              <Input
                required
                minLength={2}
                maxLength={120}
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Ex : Poulet braise"
              />
            </Field>

            <Field label={`Prix de base (${currency})`} required>
              <Input
                type="number"
                required
                min="0"
                step="50"
                value={form.basePrice}
                onChange={(event) => setForm({ ...form, basePrice: event.target.value })}
                placeholder="5000"
              />
            </Field>
          </div>

          <Field label="Description">
            <Textarea
              rows={3}
              maxLength={2000}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="Poulet braise accompagne d'alloco..."
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Catégorie" hint="Vous pouvez en créer une nouvelle ici même">
              <Select
                value={form.categoryId}
                onChange={(event) => setForm({ ...form, categoryId: event.target.value })}
              >
                <option value="">Sans catégorie</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>

              <div className="mt-2 flex gap-2">
                <Input
                  placeholder="Nouvelle catégorie (ex : Poissons)"
                  value={newCategory}
                  maxLength={60}
                  onChange={(event) => setNewCategory(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      createCategoryInline();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  icon={Check}
                  loading={creatingCategory}
                  disabled={newCategory.trim().length < 2}
                  onClick={createCategoryInline}
                >
                  Créer
                </Button>
              </div>
            </Field>

            <Field label="Photo" hint="Photographiez le plat tel qu'il est servi - JPG, PNG ou WEBP, 5 Mo maximum">
              <div className="flex flex-wrap items-center gap-3">
                {/* Sur telephone, `capture` ouvre directement l'appareil photo :
                    le restaurateur photographie l'assiette sans passer par la
                    galerie. Sur ordinateur l'attribut est ignore et le
                    selecteur de fichiers s'ouvre normalement. */}
                <label className="btn-primary cursor-pointer">
                  <Camera size={16} />
                  Prendre une photo
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={pickImage}
                  />
                </label>

                <label className="btn-secondary cursor-pointer">
                  <Upload size={16} />
                  Choisir un fichier
                  <input type="file" accept="image/*" className="hidden" onChange={pickImage} />
                </label>

                {imagePreview && (
                  <div className="relative">
                    <img
                      src={imagePreview}
                      alt="Aperçu"
                      className="h-12 w-12 rounded-lg object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setImageFile(null);
                        setImagePreview(null);
                        setRemoveImage(true);
                      }}
                      className="absolute -right-1.5 -top-1.5 rounded-full bg-red-600 p-0.5 text-white"
                      aria-label="Retirer l'image"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}
              </div>
            </Field>
          </div>

          <div className="space-y-4 rounded-xl bg-ink-50 p-4">
            <div className="flex flex-wrap gap-6">
              <Toggle
                checked={form.isAvailable}
                onChange={(value) => setForm({ ...form, isAvailable: value })}
                label="Disponible à la commande"
              />
              <Toggle
                checked={form.isActive}
                onChange={(value) => setForm({ ...form, isActive: value })}
                label="Actif au catalogue"
              />
            </div>

            <div className="border-t border-ink-200 pt-4">
              <Toggle
                checked={addToTodayMenu}
                onChange={setAddToTodayMenu}
                label="Mettre au menu du jour"
              />
              <p className="mt-2 text-xs text-ink-500">
                Un plat n&apos;est visible et commandable par les clients que s&apos;il figure au
                menu du jour. Laissez cette option activée pour le proposer dès maintenant.
              </p>
            </div>
          </div>

          {/* ------------------- Options et supplements ---------------- */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-ink-900">Options et supplements</h3>
                <p className="text-xs text-ink-500">
                  Ex : &laquo; Accompagnement &raquo; (choix unique) ou &laquo; Suppléments &raquo; (choix multiple)
                </p>
              </div>
              <Button type="button" variant="secondary" icon={ListPlus} onClick={addOptionGroup}>
                Ajouter un groupe
              </Button>
            </div>

            {form.options.length === 0 ? (
              <p className="rounded-xl bg-ink-50 px-4 py-6 text-center text-sm text-ink-500">
                Aucune option. Le produit sera commande tel quel.
              </p>
            ) : (
              <div className="space-y-4">
                {form.options.map((group, groupIndex) => (
                  <div key={groupIndex} className="rounded-xl border border-ink-200 p-4">
                    <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
                      <Field label="Nom du groupe">
                        <Input
                          value={group.name}
                          placeholder="Accompagnement"
                          onChange={(event) =>
                            updateOptionGroup(groupIndex, { name: event.target.value })
                          }
                        />
                      </Field>

                      <Field label="Type">
                        <Select
                          value={group.type}
                          onChange={(event) =>
                            updateOptionGroup(groupIndex, { type: event.target.value })
                          }
                        >
                          <option value="SINGLE">Choix unique</option>
                          <option value="MULTIPLE">Choix multiple</option>
                        </Select>
                      </Field>

                      <div className="pb-2.5">
                        <Toggle
                          checked={group.isRequired}
                          onChange={(value) => updateOptionGroup(groupIndex, { isRequired: value })}
                          label="Obligatoire"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => removeOptionGroup(groupIndex)}
                        className="mb-1 rounded-lg p-2 text-ink-400 transition hover:bg-red-50 hover:text-red-600"
                        aria-label="Supprimer le groupe"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div className="mt-3 space-y-2">
                      {group.values.map((value, valueIndex) => (
                        <div key={valueIndex} className="flex items-center gap-2">
                          <Input
                            className="flex-1"
                            placeholder="Nom (ex : Alloco)"
                            value={value.name}
                            onChange={(event) =>
                              updateOptionValue(groupIndex, valueIndex, { name: event.target.value })
                            }
                          />
                          <Input
                            type="number"
                            min="0"
                            step="50"
                            className="w-28"
                            placeholder="+0"
                            value={value.priceDelta}
                            onChange={(event) =>
                              updateOptionValue(groupIndex, valueIndex, {
                                priceDelta: event.target.value,
                              })
                            }
                          />
                          <button
                            type="button"
                            onClick={() => removeOptionValue(groupIndex, valueIndex)}
                            className="rounded-lg p-2 text-ink-400 transition hover:bg-red-50 hover:text-red-600"
                            aria-label="Supprimer"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))}

                      <button
                        type="button"
                        onClick={() => addOptionValue(groupIndex)}
                        className="text-sm font-medium text-brand-600 hover:underline"
                      >
                        + Ajouter un choix
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
        title="Supprimer le produit"
        message={
          deleteTarget
            ? `Supprimer "${deleteTarget.name}" ? S'il figure déjà dans des commandes, il sera simplement archivé afin de préserver l'historique.`
            : ''
        }
        confirmLabel="Supprimer"
        loading={saving}
      />
    </div>
  );
}
