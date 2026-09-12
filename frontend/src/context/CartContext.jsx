import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { cartKey } from '../utils/constants';

const CartContext = createContext(null);

/** Identifiant unique d'une ligne = produit + combinaison d'options choisies. */
function lineSignature(productId, optionValueIds, note) {
  return `${productId}|${[...optionValueIds].sort((a, b) => a - b).join(',')}|${note || ''}`;
}

/**
 * Panier du client, persiste dans le navigateur pour chaque table.
 * Les prix affiches viennent du menu du jour ; le serveur les revalide
 * de toute facon au moment de la commande.
 */
export function CartProvider({ tableToken, children }) {
  const storageKey = cartKey(tableToken);
  const [items, setItems] = useState([]);

  // Chargement initial depuis le stockage local
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      setItems(saved ? JSON.parse(saved) : []);
    } catch {
      setItems([]);
    }
  }, [storageKey]);

  // Sauvegarde à chaque modification
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(items));
    } catch {
      // Stockage indisponible (navigation privee) : le panier reste en memoire.
    }
  }, [items, storageKey]);

  const addItem = useCallback((product, { optionValueIds = [], quantity = 1, note = '' } = {}) => {
    const selectedOptions = [];
    for (const group of product.options || []) {
      for (const value of group.values) {
        if (optionValueIds.includes(value.id)) {
          selectedOptions.push({
            id: value.id,
            groupName: group.name,
            name: value.name,
            priceDelta: value.priceDelta,
          });
        }
      }
    }

    const optionsTotal = selectedOptions.reduce((sum, option) => sum + option.priceDelta, 0);
    const signature = lineSignature(product.productId, optionValueIds, note);

    setItems((current) => {
      const existing = current.find((item) => item.signature === signature);
      if (existing) {
        return current.map((item) =>
          item.signature === signature ? { ...item, quantity: item.quantity + quantity } : item
        );
      }
      return [
        ...current,
        {
          signature,
          productId: product.productId,
          name: product.name,
          image: product.image,
          unitPrice: product.price,
          optionsTotal,
          options: selectedOptions,
          note: note || '',
          quantity,
        },
      ];
    });
  }, []);

  const updateQuantity = useCallback((signature, quantity) => {
    setItems((current) =>
      quantity <= 0
        ? current.filter((item) => item.signature !== signature)
        : current.map((item) => (item.signature === signature ? { ...item, quantity } : item))
    );
  }, []);

  const removeItem = useCallback((signature) => {
    setItems((current) => current.filter((item) => item.signature !== signature));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  /**
   * Retire du panier les produits qui ne sont plus au menu ou plus disponibles.
   * Appele quand le menu est rafraichi.
   */
  const syncWithMenu = useCallback((menuItems) => {
    if (!menuItems) return [];
    const byProductId = new Map(menuItems.map((item) => [item.productId, item]));
    const removed = [];

    setItems((current) =>
      current.filter((item) => {
        const menuItem = byProductId.get(item.productId);
        if (!menuItem || !menuItem.isAvailable) {
          removed.push(item.name);
          return false;
        }
        return true;
      })
    );

    return removed;
  }, []);

  const totals = useMemo(() => {
    const count = items.reduce((sum, item) => sum + item.quantity, 0);
    const total = items.reduce(
      (sum, item) => sum + (item.unitPrice + item.optionsTotal) * item.quantity,
      0
    );
    return { count, total };
  }, [items]);

  const value = useMemo(
    () => ({ items, addItem, updateQuantity, removeItem, clear, syncWithMenu, ...totals }),
    [items, addItem, updateQuantity, removeItem, clear, syncWithMenu, totals]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart doit être utilise dans un CartProvider');
  return context;
}
