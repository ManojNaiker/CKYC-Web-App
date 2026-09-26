import { randomUUID } from "node:crypto";
import type {
  FinfluxCkycUpdateJob,
  FinfluxCkycUpdateJobAccepted,
  FinfluxCkycUpdateRecordInput,
} from "@workspace/api-zod";
import { logger } from "./logger";
import {
  addFinfluxCkycIdentifier,
  authenticateWithFinflux,
  type FinfluxCredentials,
} from "./finflux-client";

const MAX_ACTIVE_JOBS = 3;
const JOB_RETENTION_MS = 60 * 60 * 1000;

interface StoredJob extends FinfluxCkycUpdateJob {
  accessToken: string | null;
  records: FinfluxCkycUpdateRecordInput[];
  persistUpdateOutcomes: PersistUpdateOutcomes;
}

export interface FinfluxUpdateOutcome {
  jobId: string;
  clientId: string;
  ckycNumber: string;
  status: "success" | "failed";
  error: string | null;
  statusCode: number | null;
  resourceId: string | null;
}

type PersistUpdateOutcomes = (
  outcomes: FinfluxUpdateOutcome[],
) => Promise<void>;

const jobs = new Map<string, StoredJob>();

export class FinfluxJobsBusyError extends Error {
  constructor() {
    super("Several Finflux update jobs are already running. Try again shortly.");
    this.name = "FinfluxJobsBusyError";
  }
}

function pruneExpiredJobs(now = Date.now()): void {
  for (const [id, job] of jobs) {
    if (
      job.completedAt &&
      now - job.completedAt.getTime() > JOB_RETENTION_MS
    ) {
      jobs.delete(id);
    }
  }
}

function toPublicJob(job: StoredJob): FinfluxCkycUpdateJob {
  return {
    id: job.id,
    status: job.status,
    total: job.total,
    processed: job.processed,
    successCount: job.successCount,
    failureCount: job.failureCount,
    notAttemptedCount: job.notAttemptedCount,
    results: job.results.map((result) => ({ ...result })),
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    error: job.error,
  };
}

function updateCounts(job: StoredJob): void {
  job.processed = job.results.length;
  job.successCount = job.results.filter(
    (result) => result.status === "success" && result.attempted,
  ).length;
  job.failureCount = job.results.filter(
    (result) => result.status === "failed" && result.attempted,
  ).length;
  job.notAttemptedCount = job.results.filter(
    (result) => !result.attempted,
  ).length;
}

async function processJob(job: StoredJob): Promise<void> {
  const accessToken = job.accessToken;
  if (!accessToken) {
    job.status = "failed";
    job.error = "Finflux authentication was not available for this job.";
    job.completedAt = new Date();
    return;
  }

  job.status = "running";
  job.startedAt = new Date();
  const records = job.records;

  try {
    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      const startedAt = Date.now();
      const result = await addFinfluxCkycIdentifier(accessToken, record);
      const durationMs = Math.max(0, Date.now() - startedAt);
      job.results.push({
        rowNumber: index + 1,
        clientId: record.clientId,
        ckycNumber: record.ckycNumber,
        status: result.success ? "success" : "failed",
        attempted: true,
        message: result.message,
        statusCode: result.statusCode,
        resourceId: result.resourceId,
        durationMs,
      });
      updateCounts(job);

      if (result.authorizationRejected) {
        const message =
          "Finflux rejected authorization for this write. Remaining records were not attempted.";
        for (let remaining = index + 1; remaining < records.length; remaining += 1) {
          job.results.push({
            rowNumber: remaining + 1,
            clientId: records[remaining].clientId,
            ckycNumber: records[remaining].ckycNumber,
            status: "failed",
            attempted: false,
            message,
            statusCode: result.statusCode,
            resourceId: null,
            durationMs: 0,
          });
        }
        job.error = message;
        updateCounts(job);
        job.status = "failed";
        break;
      }
    }

  } catch {
    job.error = "The Finflux update job stopped unexpectedly.";
    job.status = "failed";
    logger.error({ jobId: job.id }, "Finflux CKYC update job stopped");
  }

  try {
    const updateOutcomes = job.results
      .filter((result) => result.attempted)
      .map((result) => ({
        jobId: job.id,
        clientId: result.clientId,
        ckycNumber: result.ckycNumber,
        status: result.status,
        error: result.status === "failed" ? result.message : null,
        statusCode: result.statusCode,
        resourceId: result.resourceId,
      }));
    if (updateOutcomes.length > 0) {
      await job.persistUpdateOutcomes(updateOutcomes);
    }
  } catch {
    job.error =
      "Finflux results were received, but their local outcome status could not be saved. Check the row results before retrying.";
    job.status = "failed";
    logger.error(
      { jobId: job.id },
      "Finflux CKYC update status persistence failed",
    );
  }

  if (job.status !== "failed") job.status = "completed";
  job.completedAt = new Date();
  job.accessToken = null;
  logger.info(
    {
      jobId: job.id,
      total: job.total,
      successCount: job.successCount,
      failureCount: job.failureCount,
      status: job.status,
    },
    "Finflux CKYC update job finished",
  );
}

export async function createFinfluxCkycUpdateJob(
  credentials: FinfluxCredentials,
  records: FinfluxCkycUpdateRecordInput[],
  persistUpdateOutcomes: PersistUpdateOutcomes = async () => {},
): Promise<FinfluxCkycUpdateJobAccepted> {
  pruneExpiredJobs();
  const activeJobCount = [...jobs.values()].filter(
    (job) => job.status === "queued" || job.status === "running",
  ).length;
  if (activeJobCount >= MAX_ACTIVE_JOBS) throw new FinfluxJobsBusyError();

  const id = randomUUID();
  const now = new Date();
  const job: StoredJob = {
    id,
    status: "queued",
    total: records.length,
    processed: 0,
    successCount: 0,
    failureCount: 0,
    notAttemptedCount: 0,
    results: [],
    createdAt: now,
    startedAt: null,
    completedAt: null,
    error: null,
    accessToken: null,
    records: records.map((record) => ({ ...record })),
    persistUpdateOutcomes,
  };
  jobs.set(id, job);

  try {
    job.accessToken = await authenticateWithFinflux(credentials);
  } catch (error) {
    jobs.delete(id);
    throw error;
  }

  void processJob(job);
  return {
    id: job.id,
    status: job.status === "queued" ? "queued" : "running",
    total: job.total,
  };
}

export function getFinfluxCkycUpdateJob(
  jobId: string,
): FinfluxCkycUpdateJob | null {
  pruneExpiredJobs();
  const job = jobs.get(jobId);
  return job ? toPublicJob(job) : null;
}