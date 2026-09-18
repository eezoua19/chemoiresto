-- AlterTable
ALTER TABLE `Order` ADD COLUMN `discountAmount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `promoCodeId` INTEGER NULL;

-- CreateTable
CREATE TABLE `PromoCode` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `restaurantId` INTEGER NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `type` ENUM('PERCENT', 'FIXED') NOT NULL,
    `value` DECIMAL(12, 2) NOT NULL,
    `minOrderAmount` DECIMAL(12, 2) NULL,
    `maxUses` INTEGER NULL,
    `usesCount` INTEGER NOT NULL DEFAULT 0,
    `expiresAt` DATETIME(3) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PromoCode_restaurantId_idx`(`restaurantId`),
    UNIQUE INDEX `PromoCode_restaurantId_code_key`(`restaurantId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Order_promoCodeId_idx` ON `Order`(`promoCodeId`);

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_promoCodeId_fkey` FOREIGN KEY (`promoCodeId`) REFERENCES `PromoCode`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PromoCode` ADD CONSTRAINT `PromoCode_restaurantId_fkey` FOREIGN KEY (`restaurantId`) REFERENCES `Restaurant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
