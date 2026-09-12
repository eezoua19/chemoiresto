-- AlterTable
ALTER TABLE `order` ADD COLUMN `customerPhone` VARCHAR(191) NULL,
    ADD COLUMN `pickupCode` VARCHAR(191) NULL,
    ADD COLUMN `type` ENUM('DINE_IN', 'TAKEAWAY') NOT NULL DEFAULT 'DINE_IN',
    MODIFY `tableId` INTEGER NULL;

-- AlterTable
ALTER TABLE `restaurant` ADD COLUMN `takeawayEnabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `takeawayToken` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Restaurant_takeawayToken_key` ON `Restaurant`(`takeawayToken`);

