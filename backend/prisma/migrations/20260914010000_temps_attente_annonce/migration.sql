-- Temps d'attente annonce au client par la serveuse.
-- Attention a la casse : le MySQL de production est sensible aux majuscules.
ALTER TABLE `Order` ADD COLUMN `estimatedMinutes` INTEGER NULL;
ALTER TABLE `Order` ADD COLUMN `estimatedReadyAt` DATETIME(3) NULL;
