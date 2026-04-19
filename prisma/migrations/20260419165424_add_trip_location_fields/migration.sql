-- AlterTable
ALTER TABLE "Trip" ADD COLUMN     "loadingAddress" TEXT,
ADD COLUMN     "loadingCoords" TEXT,
ADD COLUMN     "loadingRef" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "unloadingAddress" TEXT,
ADD COLUMN     "unloadingCoords" TEXT,
ADD COLUMN     "unloadingRef" TEXT;
