-- AlterTable
ALTER TABLE `Asset` ADD COLUMN `isVisible` BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE `Notification` MODIFY `byUserId` INTEGER NULL,
    MODIFY `toUserId` INTEGER NULL;

-- AlterTable
ALTER TABLE `ReportAsset` ADD COLUMN `feedback` VARCHAR(191) NULL,
    ADD COLUMN `status` INTEGER NOT NULL DEFAULT 0;
