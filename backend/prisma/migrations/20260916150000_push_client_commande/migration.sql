-- Abonnement push cote client : lie a la commande suivie (pas de compte),
-- donc userId devient facultatif et orderId apparait. Ecrite a la main pour
-- la meme raison que les migrations precedentes : le MySQL local (Windows)
-- rabat la casse des noms de table et casse `prisma migrate dev`/`diff`.
ALTER TABLE `PushSubscription` ADD COLUMN `orderId` INTEGER NULL,
    MODIFY `userId` INTEGER NULL;

-- CreateIndex
CREATE INDEX `PushSubscription_orderId_idx` ON `PushSubscription`(`orderId`);

-- AddForeignKey
ALTER TABLE `PushSubscription` ADD CONSTRAINT `PushSubscription_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
