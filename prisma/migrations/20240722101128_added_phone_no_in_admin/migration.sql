/*
  Warnings:

  - A unique constraint covering the columns `[phone_no]` on the table `Admin` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `Admin` ADD COLUMN `phone_no` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Admin_phone_no_key` ON `Admin`(`phone_no`);
