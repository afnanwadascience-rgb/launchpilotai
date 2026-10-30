-- Add Paddle as an independent billing provider while retaining all existing Whop identifiers.
ALTER TABLE "Subscription" ADD COLUMN "billingProvider" VARCHAR(20);
ALTER TABLE "Subscription" ADD COLUMN "paddleSubscriptionId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "paddleCustomerId" VARCHAR(80);
ALTER TABLE "Subscription" ADD COLUMN "paddlePriceId" VARCHAR(80);
CREATE UNIQUE INDEX "Subscription_paddleSubscriptionId_key" ON "Subscription"("paddleSubscriptionId");

CREATE TABLE "PaddleCheckoutIntent" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "priceId" VARCHAR(80) NOT NULL,
  "transactionId" TEXT,
  "paddleSubscriptionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "PaddleCheckoutIntent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PaddleCheckoutIntent_tokenHash_key" ON "PaddleCheckoutIntent"("tokenHash");
CREATE UNIQUE INDEX "PaddleCheckoutIntent_transactionId_key" ON "PaddleCheckoutIntent"("transactionId");
CREATE UNIQUE INDEX "PaddleCheckoutIntent_paddleSubscriptionId_key" ON "PaddleCheckoutIntent"("paddleSubscriptionId");
CREATE INDEX "PaddleCheckoutIntent_userId_createdAt_idx" ON "PaddleCheckoutIntent"("userId", "createdAt");
ALTER TABLE "PaddleCheckoutIntent" ADD CONSTRAINT "PaddleCheckoutIntent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
