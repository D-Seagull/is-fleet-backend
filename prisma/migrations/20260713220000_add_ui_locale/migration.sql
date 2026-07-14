-- CreateEnum
CREATE TYPE "UILocale" AS ENUM ('UK', 'EN', 'PL', 'LT', 'DE', 'RU');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "uiLocale" "UILocale" NOT NULL DEFAULT 'UK';
