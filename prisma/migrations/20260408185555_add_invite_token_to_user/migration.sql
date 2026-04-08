-- AlterTable
ALTER TABLE "User" ADD COLUMN     "inviteExpiry" TIMESTAMP(3),
ADD COLUMN     "inviteToken" TEXT;
