import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Minus, Plus, Trash2, ShoppingBag, ChevronLeft } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { formatMoney } from '../../utils/format';
import { Button, EmptyState } from '../ui';

/**
 * Panier du client, en deux etapes :
 *   1. recapitulatif modifiable
 *   2. confirmation (nom + commentaire facultatifs)
 */
export default function CartSheet({ open, onClose, currency, tableNumber, onConfirm, submitting }) {
  const { items, updateQuantity, removeItem, clear, total, count } = useCart();
  const [step, setStep] = useState('cart');
  const [customerName, setCustomerName] = useState('');
  const [comment, setComment] = useState('');

  if (!open) return null;

  const close = () => {
    setStep('cart');
    onClose();
  };

  const handleConfirm = () => {
    onConfirm({ customerName: customerName.trim(), comment: comment.trim() });
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 animate-fade-in bg-ink-900/60" onClick={close} aria-hidden />

      <div className="relative flex max-h-[92vh] w-full max-w-lg animate-sheet-in flex-col overflow-hidden rounded-t-3xl bg-white sm:animate-slide-up sm:rounded-3xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-ink-100 px-5 py-4">
          <div className="flex items-center gap-2">
            {step === 'confirm' && (
              <button
                type="button"
                onClick={() => setStep('cart')}
                className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100"
                aria-label="Retour"
              >
                <ChevronLeft size={18} />
              </button>
            )}
            <div>
              <h2 className="text-lg font-bold text-ink-900">
                {step === 'cart' ? 'Votre panier' : 'Confirmer la commande'}
              </h2>
              <p className="text-xs text-ink-500">Table {tableNumber}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={close}
            className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100"
            aria-label="Fermer"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {items.length === 0 ? (
            <EmptyState
              icon={ShoppingBag}
              title="Votre panier est vide"
              description="Parcourez le menu du jour et ajoutez vos plats."
            />
          ) : step === 'cart' ? (
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.signature} className="rounded-2xl border border-ink-100 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-ink-900">{item.name}</h3>

                      {item.options.length > 0 && (
                        <ul className="mt-1 space-y-0.5">
                          {item.options.map((option) => (
                            <li key={option.id} className="text-xs text-ink-500">
                              {option.groupName} : {option.name}
                              {option.priceDelta > 0 && ` (+${formatMoney(option.priceDelta, currency)})`}
                            </li>
                          ))}
                        </ul>
                      )}

                      {item.note && <p className="mt-1 text-xs italic text-ink-500">&laquo; {item.note} &raquo;</p>}

                      <p className="mt-1.5 font-bold text-ink-900">
                        {formatMoney((item.unitPrice + item.optionsTotal) * item.quantity, currency)}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeItem(item.signature)}
                      className="rounded-lg p-1.5 text-ink-400 transition hover:bg-red-50 hover:text-red-600"
                      aria-label="Supprimer"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div className="mt-2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.signature, item.quantity - 1)}
                      className="rounded-lg border border-ink-200 p-1.5 text-ink-600 transition hover:bg-ink-50"
                      aria-label="Diminuer"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="w-9 text-center text-sm font-bold text-ink-900">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.signature, item.quantity + 1)}
                      className="rounded-lg border border-ink-200 p-1.5 text-ink-600 transition hover:bg-ink-50"
                      aria-label="Augmenter"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={clear}
                className="w-full rounded-xl py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
              >
                Vider le panier
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-2xl bg-ink-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                  Table {tableNumber}
                </p>
                <ul className="mt-3 space-y-2">
                  {items.map((item) => (
                    <li key={item.signature} className="flex justify-between gap-3 text-sm">
                      <span className="text-ink-700">
                        {item.name} <span className="text-ink-400">&times;{item.quantity}</span>
                        {item.options.length > 0 && (
                          <span className="block text-xs text-ink-400">
                            {item.options.map((option) => option.name).join(', ')}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 font-semibold text-ink-900">
                        {formatMoney((item.unitPrice + item.optionsTotal) * item.quantity, currency)}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex justify-between border-t border-ink-200 pt-3 font-bold text-ink-900">
                  <span>Total</span>
                  <span>{formatMoney(total, currency)}</span>
                </div>
              </div>

              <div>
                <label className="label" htmlFor="customer-name">
                  Votre nom (facultatif)
                </label>
                <input
                  id="customer-name"
                  className="input"
                  maxLength={80}
                  placeholder="Ex : Awa"
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                />
              </div>

              <div>
                <label className="label" htmlFor="order-comment">
                  Commentaire pour la cuisine (facultatif)
                </label>
                <textarea
                  id="order-comment"
                  className="input"
                  rows={3}
                  maxLength={500}
                  placeholder="Ex : sans piment, servir en meme temps..."
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="safe-bottom shrink-0 border-t border-ink-100 bg-white px-5 pt-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm text-ink-500">
                {count} article{count > 1 ? 's' : ''}
              </span>
              <span className="text-lg font-bold text-ink-900">{formatMoney(total, currency)}</span>
            </div>

            {step === 'cart' ? (
              <div className="flex gap-2">
                <Button variant="secondary" onClick={close} className="flex-1">
                  Continuer
                </Button>
                <Button onClick={() => setStep('confirm')} className="flex-1">
                  Commander
                </Button>
              </div>
            ) : (
              <Button onClick={handleConfirm} loading={submitting} className="w-full">
                Confirmer la commande
              </Button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
