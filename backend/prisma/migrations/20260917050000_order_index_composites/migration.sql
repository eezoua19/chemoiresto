-- CreateIndex
CREATE INDEX `Order_restaurantId_createdAt_idx` ON `Order`(`restaurantId`, `createdAt`);

-- CreateIndex
CREATE INDEX `Order_restaurantId_status_createdAt_idx` ON `Order`(`restaurantId`, `status`, `createdAt`);
