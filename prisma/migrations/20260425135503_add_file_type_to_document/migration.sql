-- CreateEnum
CREATE TYPE "FileDocType" AS ENUM ('PHOTO', 'DOCUMENT');

-- AlterTable
ALTER TABLE "TripDocument" ADD COLUMN     "fileType" "FileDocType" NOT NULL DEFAULT 'DOCUMENT';
