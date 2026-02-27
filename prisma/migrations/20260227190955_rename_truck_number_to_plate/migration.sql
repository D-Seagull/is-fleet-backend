/*
  Warnings:

  - You are about to drop the column `number` on the `Truck` table. All the data in the column will be lost.
  - Added the required column `plate` to the `Truck` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Truck" DROP COLUMN "number",
ADD COLUMN     "plate" TEXT NOT NULL;
