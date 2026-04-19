/*
  Warnings:

  - You are about to drop the column `loadingAddress` on the `Trip` table. All the data in the column will be lost.
  - You are about to drop the column `loadingCoords` on the `Trip` table. All the data in the column will be lost.
  - You are about to drop the column `loadingRef` on the `Trip` table. All the data in the column will be lost.
  - You are about to drop the column `unloadingAddress` on the `Trip` table. All the data in the column will be lost.
  - You are about to drop the column `unloadingCoords` on the `Trip` table. All the data in the column will be lost.
  - You are about to drop the column `unloadingRef` on the `Trip` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "StopType" AS ENUM ('LOADING', 'UNLOADING');

-- AlterTable
ALTER TABLE "Trip" DROP COLUMN "loadingAddress",
DROP COLUMN "loadingCoords",
DROP COLUMN "loadingRef",
DROP COLUMN "unloadingAddress",
DROP COLUMN "unloadingCoords",
DROP COLUMN "unloadingRef";

-- CreateTable
CREATE TABLE "TripStop" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "type" "StopType" NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "company" TEXT,
    "street" TEXT,
    "postcode" TEXT,
    "city" TEXT,
    "ref" TEXT,
    "coords" TEXT,

    CONSTRAINT "TripStop_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "TripStop" ADD CONSTRAINT "TripStop_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
