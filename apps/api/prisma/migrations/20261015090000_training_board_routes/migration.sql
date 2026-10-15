CREATE TABLE "TrainingBoardRoute" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdByAccountId" TEXT NOT NULL,
    "updatedByAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "angle" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "document" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TrainingBoardRoute_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TrainingBoardRoute_angle_check" CHECK ("angle" BETWEEN 0 AND 60 AND "angle" % 5 = 0),
    CONSTRAINT "TrainingBoardRoute_revision_check" CHECK ("revision" > 0),
    CONSTRAINT "TrainingBoardRoute_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TrainingBoardRoute_createdByAccountId_fkey" FOREIGN KEY ("createdByAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TrainingBoardRoute_updatedByAccountId_fkey" FOREIGN KEY ("updatedByAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "TrainingBoardRoute_organizationId_updatedAt_idx" ON "TrainingBoardRoute"("organizationId", "updatedAt");
