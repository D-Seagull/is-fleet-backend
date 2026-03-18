-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "accountingEmail" TEXT,
ADD COLUMN     "directorEmail" TEXT,
ADD COLUMN     "hrEmail" TEXT,
ADD COLUMN     "logo" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatar" TEXT;
