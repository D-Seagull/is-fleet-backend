-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "logoPublicId" TEXT;

-- AlterTable
ALTER TABLE "TripDocument" ADD COLUMN     "publicId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarPublicId" TEXT;
