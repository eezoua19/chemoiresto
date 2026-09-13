-- Sauvegardes automatiques et clotures de journee.
-- Attention a la casse : le MySQL de production est sensible aux majuscules.
CREATE TABLE `BackupSnapshot` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `restaurantId` INTEGER NOT NULL,
    `trigger` VARCHAR(20) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `counts` TEXT NULL,
    `content` LONGTEXT NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `BackupSnapshot_restaurantId_createdAt_idx`(`restaurantId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `DailyClosing` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `restaurantId` INTEGER NOT NULL,
    `date` DATE NOT NULL,
    `revenue` DECIMAL(12, 2) NOT NULL,
    `ordersCount` INTEGER NOT NULL,
    `cancelledCount` INTEGER NOT NULL,
    `averageTicket` DECIMAL(12, 2) NOT NULL,
    `dineInRevenue` DECIMAL(12, 2) NOT NULL,
    `takeawayRevenue` DECIMAL(12, 2) NOT NULL,
    `topProducts` TEXT NULL,
    `servers` TEXT NULL,
    `peakHour` INTEGER NULL,
    `subscriptionUsages` INTEGER NOT NULL DEFAULT 0,
    `serviceRequests` INTEGER NOT NULL DEFAULT 0,
    `closedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DailyClosing_restaurantId_date_idx`(`restaurantId`, `date`),
    UNIQUE INDEX `DailyClosing_restaurantId_date_key`(`restaurantId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `BackupSnapshot` ADD CONSTRAINT `BackupSnapshot_restaurantId_fkey` FOREIGN KEY (`restaurantId`) REFERENCES `Restaurant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `DailyClosing` ADD CONSTRAINT `DailyClosing_restaurantId_fkey` FOREIGN KEY (`restaurantId`) REFERENCES `Restaurant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
