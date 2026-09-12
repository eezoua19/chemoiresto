import { useCallback, useEffect, useState } from 'react';
import { Settings, Save, Upload, X } from 'lucide-react';
import { restaurantApi } from '../../services/endpoints';
import { imageUrl } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { applyBrandColor } from '../../utils/color';
import {
  Button,
  Card,
  CardHeader,
  ErrorState,
  Field,
  Input,
  PageHeader,
  Skeleton,
  Textarea,
} from '../../components/ui';

const PRESET_COLORS = ['#E4572E', '#C1121F', '#F0A202', '#0E7C66', '#2563EB', '#7C3AED', '#111827'];

export default function AdminSettingsPage() {
  const { setRestaurant } = useAuth();
  const toast = useToast();

  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const restaurant = await restaurantApi.detail();
      setForm({
        name: restaurant.name || '',
        description: restaurant.description || '',
        address: restaurant.address || '',
        phone: restaurant.phone || '',
        email: restaurant.email || '',
        currency: restaurant.currency || 'FCFA',
        openingHours: restaurant.openingHours || '',
        primaryColor: restaurant.primaryColor || '#E4572E',
        welcomeMessage: restaurant.welcomeMessage || '',
      });
      setLogoPreview(restaurant.logo ? imageUrl(restaurant.logo) : null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pickLogo = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Logo trop volumineux (5 Mo maximum)');
      return;
    }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const formData = new FormData();
      Object.entries(form).forEach(([key, value]) => formData.append(key, value ?? ''));
      if (logoFile) formData.append('logo', logoFile);

      const updated = await restaurantApi.update(formData);
      setRestaurant((current) => ({ ...current, ...updated }));
      applyBrandColor(updated.primaryColor);
      setLogoFile(null);
      setLogoPreview(updated.logo ? imageUrl(updated.logo) : null);
      toast.success('Parametres enregistres');
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
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  if (error) return <ErrorState message={error.message} onRetry={load} isNetwork={error.isNetwork} />;

  return (
    <div>
      <PageHeader
        title="Parametres du restaurant"
        subtitle="Ces informations apparaissent sur la page client et sur les tickets"
        icon={Settings}
        action={
          <Button type="submit" form="settings-form" icon={Save} loading={saving}>
            Enregistrer
          </Button>
        }
      />

      <form id="settings-form" onSubmit={submit} className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Identite" />
          <div className="space-y-4 p-5">
            <Field label="Nom du restaurant" required>
              <Input
                required
                minLength={2}
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </Field>

            <Field label="Description">
              <Textarea
                rows={3}
                maxLength={2000}
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="Maquis & Grill - cuisine ivoirienne et grillades au feu de bois."
              />
            </Field>

            <Field label="Message d'accueil" hint="Affiche au client apres le scan du QR Code">
              <Input
                maxLength={300}
                value={form.welcomeMessage}
                onChange={(event) => setForm({ ...form, welcomeMessage: event.target.value })}
                placeholder="Bienvenue chez nous. Bon appetit !"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Adresse">
                <Input
                  maxLength={200}
                  value={form.address}
                  onChange={(event) => setForm({ ...form, address: event.target.value })}
                />
              </Field>

              <Field label="Telephone">
                <Input
                  maxLength={30}
                  value={form.phone}
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                />
              </Field>

              <Field label="Email">
                <Input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                />
              </Field>

              <Field label="Devise" hint="Ex : FCFA, EUR, USD">
                <Input
                  required
                  maxLength={10}
                  value={form.currency}
                  onChange={(event) => setForm({ ...form, currency: event.target.value })}
                />
              </Field>
            </div>

            <Field label="Horaires d'ouverture">
              <Textarea
                rows={2}
                maxLength={500}
                value={form.openingHours}
                onChange={(event) => setForm({ ...form, openingHours: event.target.value })}
                placeholder="Lundi - Dimanche : 11h00 - 23h30"
              />
            </Field>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Logo" />
            <div className="p-5">
              <div className="flex items-center gap-4">
                {logoPreview ? (
                  <div className="relative">
                    <img src={logoPreview} alt="Logo" className="h-20 w-20 rounded-xl object-cover" />
                    <button
                      type="button"
                      onClick={() => {
                        setLogoFile(null);
                        setLogoPreview(null);
                      }}
                      className="absolute -right-2 -top-2 rounded-full bg-red-600 p-1 text-white"
                      aria-label="Retirer"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-ink-100 text-xs text-ink-400">
                    Aucun
                  </div>
                )}

                <label className="btn-secondary cursor-pointer">
                  <Upload size={16} />
                  Choisir un logo
                  <input type="file" accept="image/*" className="hidden" onChange={pickLogo} />
                </label>
              </div>
              <p className="mt-3 text-xs text-ink-500">
                Format carre recommande. JPG, PNG ou WEBP, 5 Mo maximum.
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Couleur principale" subtitle="Applique a toute l'application" />
            <div className="p-5">
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={form.primaryColor}
                  onChange={(event) => setForm({ ...form, primaryColor: event.target.value })}
                  className="h-11 w-16 cursor-pointer rounded-lg border border-ink-200"
                />
                <Input
                  value={form.primaryColor}
                  pattern="^#[0-9a-fA-F]{6}$"
                  onChange={(event) => setForm({ ...form, primaryColor: event.target.value })}
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setForm({ ...form, primaryColor: color })}
                    className={`h-8 w-8 rounded-lg border-2 transition ${
                      form.primaryColor.toUpperCase() === color ? 'border-ink-900' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: color }}
                    aria-label={`Couleur ${color}`}
                  />
                ))}
              </div>

              <div
                className="mt-4 rounded-xl p-4 text-center text-sm font-semibold text-white"
                style={{ backgroundColor: form.primaryColor }}
              >
                Apercu de la couleur
              </div>
            </div>
          </Card>
        </div>
      </form>
    </div>
  );
}
