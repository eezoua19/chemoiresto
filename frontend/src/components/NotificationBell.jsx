import { useEffect, useRef, useState } from 'react';
import { Bell, Check, ShoppingBag, Receipt, Info } from 'lucide-react';
import { notificationApi } from '../services/endpoints';
import useSocketEvent from '../hooks/useSocketEvent';
import { timeAgo } from '../utils/format';

const ICONS = {
  NEW_ORDER: ShoppingBag,
  CALL_SERVER: Bell,
  BILL_REQUEST: Receipt,
  ORDER_STATUS: Info,
  SYSTEM: Info,
};

/** Cloche de notifications, alimentee par l'API puis par Socket.IO. */
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const panelRef = useRef(null);

  const load = () =>
    notificationApi
      .list({ limit: 30 })
      .then(setNotifications)
      .catch(() => {});

  useEffect(() => {
    load();
  }, []);

  useSocketEvent('notification', (notification) => {
    setNotifications((current) => [notification, ...current].slice(0, 30));
  });

  useEffect(() => {
    if (!open) return undefined;
    const onClickOutside = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const unread = notifications.filter((notification) => !notification.isRead).length;

  const markAllRead = async () => {
    await notificationApi.markAllRead().catch(() => {});
    setNotifications((current) => current.map((n) => ({ ...n, isRead: true })));
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative rounded-xl p-2.5 text-ink-500 dark:text-ink-400 transition hover:bg-ink-100 dark:hover:bg-ink-700 hover:text-ink-800"
        aria-label="Notifications"
      >
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[320px] animate-slide-up overflow-hidden rounded-2xl border border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-800 shadow-float sm:w-[380px]">
          <div className="flex items-center justify-between border-b border-ink-100 dark:border-ink-700 px-4 py-3">
            <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-50">Notifications</h3>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
              >
                <Check size={14} /> Tout marquer lu
              </button>
            )}
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-ink-500 dark:text-ink-400">Aucune notification</p>
            ) : (
              notifications.map((notification) => {
                const Icon = ICONS[notification.type] || Info;
                return (
                  <div
                    key={notification.id}
                    className={`flex gap-3 border-b border-ink-50 px-4 py-3 last:border-0 ${
                      notification.isRead ? '' : 'bg-brand-50/40'
                    }`}
                  >
                    <span className="mt-0.5 h-fit rounded-lg bg-ink-100 dark:bg-ink-800 p-1.5 text-ink-600 dark:text-ink-300">
                      <Icon size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink-900 dark:text-ink-50">{notification.title}</p>
                      {notification.body && (
                        <p className="truncate text-xs text-ink-500 dark:text-ink-400">{notification.body}</p>
                      )}
                      <p className="mt-0.5 text-[11px] text-ink-400 dark:text-ink-500">{timeAgo(notification.createdAt)}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
