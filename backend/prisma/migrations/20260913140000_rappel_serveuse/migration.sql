-- Rappels du client lorsqu'aucune serveuse n'est venue.
-- Attention a la casse : le MySQL de production est sensible aux majuscules.
ALTER TABLE `ServiceRequest` ADD COLUMN `reminderCount` INTEGER NOT NULL DEFAULT 0;
ALTER TABLE `ServiceRequest` ADD COLUMN `lastReminderAt` DATETIME(3) NULL;
