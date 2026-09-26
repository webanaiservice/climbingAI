-- CreateTable
CREATE TABLE "TrainingAthlete" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "birthDate" DATE,
    "trainingSince" DATE,
    "coachName" TEXT NOT NULL DEFAULT '',
    "groupName" TEXT NOT NULL DEFAULT '',
    "goal" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingAthlete_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingMeasurement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "measuredAt" DATE NOT NULL,
    "heightCm" DOUBLE PRECISION,
    "weightKg" DOUBLE PRECISION,
    "armSpanCm" DOUBLE PRECISION,
    "testName" TEXT NOT NULL DEFAULT '',
    "testResult" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingMeasurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingCourse" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "standardReference" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "routeVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingSession" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "trainedAt" DATE NOT NULL,
    "focus" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "fatigue" INTEGER,
    "painNote" TEXT NOT NULL DEFAULT '',
    "actualWork" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingAttempt" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "sessionId" TEXT,
    "courseId" TEXT NOT NULL,
    "attemptedAt" TIMESTAMP(3) NOT NULL,
    "lane" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "timeMs" INTEGER,
    "timingSource" TEXT NOT NULL,
    "targetDescription" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "events" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingVideo" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "originalKey" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingVideo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingAnalysis" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "model" TEXT NOT NULL,
    "inputSnapshot" JSONB NOT NULL,
    "report" JSONB,
    "error" TEXT,
    "requestedBy" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingReview" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "reviewedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingTask" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "analysisId" TEXT,
    "title" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "criterion" TEXT NOT NULL,
    "dueAt" DATE,
    "status" TEXT NOT NULL DEFAULT 'TODO',
    "retestAttemptId" TEXT,
    "resultNote" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrainingAthlete_organizationId_archived_idx" ON "TrainingAthlete"("organizationId", "archived");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingAthlete_organizationId_id_key" ON "TrainingAthlete"("organizationId", "id");

-- CreateIndex
CREATE INDEX "TrainingMeasurement_organizationId_athleteId_measuredAt_idx" ON "TrainingMeasurement"("organizationId", "athleteId", "measuredAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingCourse_organizationId_id_key" ON "TrainingCourse"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingCourse_organizationId_name_version_key" ON "TrainingCourse"("organizationId", "name", "version");

-- CreateIndex
CREATE INDEX "TrainingSession_organizationId_trainedAt_idx" ON "TrainingSession"("organizationId", "trainedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingSession_organizationId_athleteId_id_key" ON "TrainingSession"("organizationId", "athleteId", "id");

-- CreateIndex
CREATE INDEX "TrainingAttempt_organizationId_athleteId_attemptedAt_idx" ON "TrainingAttempt"("organizationId", "athleteId", "attemptedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingAttempt_organizationId_id_key" ON "TrainingAttempt"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingAttempt_organizationId_athleteId_id_key" ON "TrainingAttempt"("organizationId", "athleteId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingVideo_attemptId_key" ON "TrainingVideo"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingVideo_objectKey_key" ON "TrainingVideo"("objectKey");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingVideo_originalKey_key" ON "TrainingVideo"("originalKey");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingVideo_organizationId_id_key" ON "TrainingVideo"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingVideo_organizationId_attemptId_key" ON "TrainingVideo"("organizationId", "attemptId");

-- CreateIndex
CREATE INDEX "TrainingAnalysis_status_createdAt_idx" ON "TrainingAnalysis"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingAnalysis_organizationId_id_key" ON "TrainingAnalysis"("organizationId", "id");

-- CreateIndex
CREATE INDEX "TrainingReview_analysisId_createdAt_idx" ON "TrainingReview"("analysisId", "createdAt");

-- CreateIndex
CREATE INDEX "TrainingTask_organizationId_athleteId_status_idx" ON "TrainingTask"("organizationId", "athleteId", "status");

-- AddForeignKey
ALTER TABLE "TrainingAthlete" ADD CONSTRAINT "TrainingAthlete_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingMeasurement" ADD CONSTRAINT "TrainingMeasurement_organizationId_athleteId_fkey" FOREIGN KEY ("organizationId", "athleteId") REFERENCES "TrainingAthlete"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCourse" ADD CONSTRAINT "TrainingCourse_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCourse" ADD CONSTRAINT "TrainingCourse_routeVersionId_fkey" FOREIGN KEY ("routeVersionId") REFERENCES "RouteVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_organizationId_athleteId_fkey" FOREIGN KEY ("organizationId", "athleteId") REFERENCES "TrainingAthlete"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAttempt" ADD CONSTRAINT "TrainingAttempt_organizationId_athleteId_fkey" FOREIGN KEY ("organizationId", "athleteId") REFERENCES "TrainingAthlete"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAttempt" ADD CONSTRAINT "TrainingAttempt_organizationId_athleteId_sessionId_fkey" FOREIGN KEY ("organizationId", "athleteId", "sessionId") REFERENCES "TrainingSession"("organizationId", "athleteId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAttempt" ADD CONSTRAINT "TrainingAttempt_organizationId_courseId_fkey" FOREIGN KEY ("organizationId", "courseId") REFERENCES "TrainingCourse"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingVideo" ADD CONSTRAINT "TrainingVideo_organizationId_attemptId_fkey" FOREIGN KEY ("organizationId", "attemptId") REFERENCES "TrainingAttempt"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAnalysis" ADD CONSTRAINT "TrainingAnalysis_organizationId_attemptId_fkey" FOREIGN KEY ("organizationId", "attemptId") REFERENCES "TrainingAttempt"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAnalysis" ADD CONSTRAINT "TrainingAnalysis_organizationId_videoId_fkey" FOREIGN KEY ("organizationId", "videoId") REFERENCES "TrainingVideo"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingReview" ADD CONSTRAINT "TrainingReview_organizationId_analysisId_fkey" FOREIGN KEY ("organizationId", "analysisId") REFERENCES "TrainingAnalysis"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingTask" ADD CONSTRAINT "TrainingTask_organizationId_athleteId_fkey" FOREIGN KEY ("organizationId", "athleteId") REFERENCES "TrainingAthlete"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingTask" ADD CONSTRAINT "TrainingTask_organizationId_analysisId_fkey" FOREIGN KEY ("organizationId", "analysisId") REFERENCES "TrainingAnalysis"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingTask" ADD CONSTRAINT "TrainingTask_organizationId_athleteId_retestAttemptId_fkey" FOREIGN KEY ("organizationId", "athleteId", "retestAttemptId") REFERENCES "TrainingAttempt"("organizationId", "athleteId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

