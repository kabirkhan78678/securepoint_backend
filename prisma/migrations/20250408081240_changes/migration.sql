-- AlterTable
ALTER TABLE `Asset` ADD COLUMN `adminFeedback` VARCHAR(191) NULL,
    ADD COLUMN `reportedCount` INTEGER NULL,
    ADD COLUMN `reviewStatus` INTEGER NULL;

-- AlterTable
ALTER TABLE `Notification` ADD COLUMN `byAdminId` INTEGER NULL;

-- AlterTable
ALTER TABLE `Plan` ADD COLUMN `inr` VARCHAR(191) NULL,
    ADD COLUMN `ngn` VARCHAR(191) NULL,
    ADD COLUMN `usd` VARCHAR(191) NULL,
    MODIFY `amount` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `country` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `UserSetting` ADD COLUMN `emailNotification` BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE `UserUpdateRequests` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `newEmail` VARCHAR(191) NULL,
    `newPhone` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Pending',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `UserUpdateRequests_newEmail_key`(`newEmail`),
    UNIQUE INDEX `UserUpdateRequests_newPhone_key`(`newPhone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_byAdminId_fkey` FOREIGN KEY (`byAdminId`) REFERENCES `Admin`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserUpdateRequests` ADD CONSTRAINT `UserUpdateRequests_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
