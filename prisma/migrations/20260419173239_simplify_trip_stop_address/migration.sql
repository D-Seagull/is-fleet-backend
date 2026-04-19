/*
  Warnings:

  - You are about to drop the column `city` on the `TripStop` table. All the data in the column will be lost.
  - You are about to drop the column `company` on the `TripStop` table. All the data in the column will be lost.
  - You are about to drop the column `postcode` on the `TripStop` table. All the data in the column will be lost.
  - You are about to drop the column `street` on the `TripStop` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "TripStop" DROP COLUMN "city",
DROP COLUMN "company",
DROP COLUMN "postcode",
DROP COLUMN "street",
ADD COLUMN     "address" TEXT;
