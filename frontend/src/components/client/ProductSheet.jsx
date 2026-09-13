import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import usePresence from '../../hooks/usePresence';
import { X, Minus, Plus, UtensilsCrossed, Star } from 'lucide-react';
import { imageUrl } from '../../services/api';
import { formatMoney } from '../../utils/format';

/**
 * Fiche produit : choix des options, des supplements, de la quantité.
 * Le prix affiche est recalcule en direct à chaque changement.
 */
export default function ProductSheet({ item: plat, currency, open, onClose, onAdd }) {
  const [selected, setSelected] = useState({});
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  const { monte, sortant } = usePresence(open);

  // En fermant, le parent efface le plat selectionne. Sans cette memoire, le
  // panneau se viderait d'un coup au lieu de redescendre.
  const dernier = useRef(plat);
  if (plat) dernier.current = plat;
  const item = plat || dernier.current;

  // Reinitialise à chaque ouverture, en pre-selectionnant les choix obligatoires.
  useEffect(() => {
    if (!open || !item) return;
    const initial = {};
    for (const group of item.options || []) {
      if (group.type === 'SINGLE' && group.isRequired && group.values.length) {
        initial[group.id] = [group.values[0].id];
      } else {
        initial[group.id] = [];
      }
    }
    setSelected(initial);
    setQuantity(1);
    setNote('');
    setError(null);
  }, [open, item]);

  useEffect(() => {
    if (!open) return undefined;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const selectedIds = useMemo(() => Object.values(selected).flat(), [selected]);

  const unitTotal = useMemo(() => {
    if (!item) return 0;
    let total = item.price;
    for (const group of item.options || []) {
      for (const value of group.values) {
        if (selectedIds.includes(value.id)) total += value.priceDelta;
      }
    }
    return total;
  }, [item, selectedIds]);

  // Le panneau reste monte le temps de redescendre hors de l'ecran.
  if (!monte || !item) return null;

  const toggle = (group, valueId) => {
    setError(null);
    setSelected((current) => {
      const currentGroup = current[group.id] || [];
      if (group.type === 'SINGLE') {
        return { ...current, [group.id]: [valueId] };
      }
      return {
        ...current,
        [group.id]: currentGroup.includes(valueId)
          ? currentGroup.filter((id) => id !== valueId)
          : [...currentGroup, valueId],
      };
    });
  };

  const handleAdd = () => {
    const missing = (item.options || []).find(
      (group) => group.isRequired && (selected[group.id] || []).length === 0
    );
    if (missing) {
      setError(`Veuillez choisir : ${missing.name}`);
      return;
    }
    onAdd(item, { optionValueIds: selectedIds, quantity, note: note.trim() });
    onClose();
  };

  const image = imageUrl(item.image);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className={`absolute inset-0 bg-ink-900/60 ${sortant ? 'animate-fade-out' : 'animate-fade-in'}`}
        onClick={onClose}
        aria-hidden
      />

      <div
        className={`relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden
                    rounded-t-3xl bg-white sm:rounded-3xl ${
                      sortant
                        ? 'animate-sheet-out sm:animate-slide-down'
                        : 'animate-sheet-in sm:animate-slide-up'
                    }`}
      >
        <div className="relative h-44 shrink-0 bg-ink-100 sm:h-52">
          {image ? (
            <img src={image} alt={item.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-brand-50 text-brand-300">
              <UtensilsCrossed size={40} />
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 rounded-full bg-white/90 p-2 text-ink-700 shadow backdrop-blur"
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
          {item.isDishOfDay && (
            <span className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-amber-400 px-2.5 py-1 text-xs font-bold text-amber-950">
              <Star size={12} className="fill-amber-950" /> PLAT DU JOUR
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <h2 className="text-xl font-bold text-ink-900">{item.name}</h2>
          {item.description && <p className="mt-1.5 text-sm text-ink-500">{item.description}</p>}
          <p className="mt-2 text-lg font-bold" style={{ color: 'var(--brand)' }}>
            {formatMoney(item.price, currency)}
          </p>

          {(item.options || []).map((group) => (
            <div key={group.id} className="mt-6">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-semibold text-ink-900">{group.name}</h3>
                <span className="text-xs font-medium text-ink-500">
                  {group.isRequired ? 'Obligatoire' : 'Facultatif'}
                  {group.type === 'MULTIPLE' ? ' - choix multiple' : ''}
                </span>
              </div>

              <div className="space-y-2">
                {group.values.map((value) => {
                  const isSelected = (selected[group.id] || []).includes(value.id);
                  return (
                    <button
                      key={value.id}
                      type="button"
                      onClick={() => toggle(group, value.id)}
                      className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition
                                  ${isSelected ? 'border-brand-400 bg-brand-50' : 'border-ink-200 bg-white hover:bg-ink-50'}`}
                    >
                      <span className="flex items-center gap-3">
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center border-2 transition
                            ${group.type === 'SINGLE' ? 'rounded-full' : 'rounded-md'}
                            ${isSelected ? 'border-brand-500 bg-brand-500' : 'border-ink-300'}`}
                        >
                          {isSelected && (
                            <span
                              className={`bg-white ${
                                group.type === 'SINGLE' ? 'h-1.5 w-1.5 rounded-full' : 'h-2 w-2 rounded-sm'
                              }`}
                            />
                          )}
                        </span>
                        <span className="text-sm font-medium text-ink-800">{value.name}</span>
                      </span>
                      {value.priceDelta > 0 && (
                        <span className="text-sm font-semibold text-ink-600">
                          +{formatMoney(value.priceDelta, currency)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="mt-6">
            <label className="label" htmlFor="product-note">
              Précision (facultatif)
            </label>
            <input
              id="product-note"
              className="input"
              placeholder="Ex : sans piment, bien cuit..."
              maxLength={200}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>

          {error && (
            <p className="mt-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">
              {error}
            </p>
          )}
        </div>

        <div className="safe-bottom flex shrink-0 items-center gap-3 border-t border-ink-100 bg-white px-5 pt-4">
          <div className="flex items-center gap-1 rounded-xl border border-ink-200 p-1">
            <button
              type="button"
              onClick={() => setQuantity((value) => Math.max(1, value - 1))}
              className="rounded-lg p-2 text-ink-600 transition hover:bg-ink-100 disabled:opacity-40"
              disabled={quantity <= 1}
              aria-label="Diminuer"
            >
              <Minus size={16} />
            </button>
            <span className="w-8 text-center font-bold text-ink-900">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((value) => Math.min(50, value + 1))}
              className="rounded-lg p-2 text-ink-600 transition hover:bg-ink-100"
              aria-label="Augmenter"
            >
              <Plus size={16} />
            </button>
          </div>

          <button type="button" onClick={handleAdd} className="btn-primary flex-1">
            Ajouter - {formatMoney(unitTotal * quantity, currency)}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
