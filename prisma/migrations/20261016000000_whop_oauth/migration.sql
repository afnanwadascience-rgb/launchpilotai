-- Add Whop OAuth identity support without changing the already-applied initial migration.
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN "whopUserId" TEXT;
CREATE UNIQUE INDEX "User_whopUserId_key" ON "User"("whopUserId");
