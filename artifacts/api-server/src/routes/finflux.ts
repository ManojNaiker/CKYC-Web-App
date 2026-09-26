import { Router, type IRouter, type Response } from "express";
import { and, eq, or } from "drizzle-orm";
import { db, finfluxCkycUpdatesTable } from "@workspace/db";
import {
  CreateFinfluxCkycUpdateJobBody,
  CreateFinfluxCkycUpdateJobResponse,
  GetFinfluxCkycUpdateJobQueryParams,
  GetFinfluxCkycUpdateJobResponse,
  PreviewFinfluxCkycImportBody,
  PreviewFinfluxCkycImportResponse,
} from "@workspace/api-zod";
import {
  FinfluxImportError,
  previewFinfluxImportFile,
} from "../lib/finflux-ckyc-import";
import {
  FinfluxAuthenticationError,
  FinfluxUnavailableError,
} from "../lib/finflux-client";
import {
  createFinfluxCkycUpdateJob,
  FinfluxJobsBusyError,
  getFinfluxCkycUpdateJob,
} from "../lib/finflux-update-jobs";
import { persistFinfluxUpdateOutcomes } from "../lib/finflux-update-status";

const router: IRouter = Router();

function sendError(
  res: Response,
  status: number,
  message: string,
): void {
  res.status(status).json({ error: message });
}

router.post("/finflux/ckyc-import/preview", async (req, res): Promise<void> => {
  const parsed = PreviewFinfluxCkycImportBody.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, "Provide a file name and a base64-encoded CSV or XLSX file.");
    return;
  }

  try {
    const preview = await previewFinfluxImportFile(
      parsed.data.fileName.trim(),
      parsed.data.fileContentBase64,
    );
    const eligibleRows = preview.rows.filter(
      (row) => row.valid && row.clientId && row.ckycNumber,
    );
    const updatedRows =
      eligibleRows.length === 0
        ? []
        : await db
            .select({
              clientId: finfluxCkycUpdatesTable.clientId,
              ckycNumber: finfluxCkycUpdatesTable.ckycNumber,
            })
            .from(finfluxCkycUpdatesTable)
            .where(
              or(
                ...eligibleRows.map((row) =>
                  and(
                    eq(finfluxCkycUpdatesTable.clientId, row.clientId!),
                    eq(finfluxCkycUpdatesTable.ckycNumber, row.ckycNumber!),
                  ),
                ),
              ),
            );
    const updatedKeys = new Set(
      updatedRows.map((row) => JSON.stringify([row.clientId, row.ckycNumber])),
    );
    const rows = preview.rows.map((row) => {
      if (
        !row.valid ||
        !row.clientId ||
        !row.ckycNumber ||
        !updatedKeys.has(JSON.stringify([row.clientId, row.ckycNumber]))
      ) {
        return row;
      }
      return {
        ...row,
        valid: false,
        error: "This ClientID and CKYC number have already been updated in Finflux.",
      };
    });
    const validCount = rows.filter((row) => row.valid).length;
    res.json(
      PreviewFinfluxCkycImportResponse.parse({
        ...preview,
        rows,
        validCount,
        invalidCount: rows.length - validCount,
      }),
    );
  } catch (error) {
    if (error instanceof FinfluxImportError) {
      sendError(res, 400, error.message);
      return;
    }
    sendError(res, 500, "The uploaded file could not be previewed.");
  }
});

router.post("/finflux/ckyc-update-jobs", async (req, res): Promise<void> => {
  const parsed = CreateFinfluxCkycUpdateJobBody.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, "Provide Finflux login details and at least one valid record.");
    return;
  }

  const credentials = {
    username: parsed.data.credentials.username.trim(),
    password: parsed.data.credentials.password,
  };
  if (!credentials.username || !credentials.password.trim()) {
    sendError(res, 400, "Finflux username and password are required.");
    return;
  }

  const records = parsed.data.records.map((record) => ({
    clientId: record.clientId.trim(),
    ckycNumber: record.ckycNumber.trim(),
  }));
  const seenClientIds = new Set<string>();
  for (const record of records) {
    if (!record.clientId || !record.ckycNumber) {
      sendError(res, 400, "Every record must include client_id and ckyc_number.");
      return;
    }
    if (seenClientIds.has(record.clientId)) {
      sendError(res, 400, "Each client_id can appear only once in an update job.");
      return;
    }
    seenClientIds.add(record.clientId);
  }

  try {
    const accepted = await createFinfluxCkycUpdateJob(
      credentials,
      records,
      persistFinfluxUpdateOutcomes,
    );
    res.status(202).json(CreateFinfluxCkycUpdateJobResponse.parse(accepted));
  } catch (error) {
    if (error instanceof FinfluxAuthenticationError) {
      sendError(res, 401, error.message);
      return;
    }
    if (error instanceof FinfluxJobsBusyError) {
      sendError(res, 429, error.message);
      return;
    }
    if (error instanceof FinfluxUnavailableError) {
      sendError(res, 502, error.message);
      return;
    }
    sendError(res, 502, "Could not start the Finflux update job.");
  }
});

router.get("/finflux/ckyc-update-jobs", (req, res): void => {
  const parsed = GetFinfluxCkycUpdateJobQueryParams.safeParse(req.query);
  if (!parsed.success) {
    sendError(res, 400, "A valid jobId is required.");
    return;
  }

  const job = getFinfluxCkycUpdateJob(parsed.data.jobId);
  if (!job) {
    sendError(res, 404, "Finflux update job not found or expired.");
    return;
  }

  res.json(GetFinfluxCkycUpdateJobResponse.parse(job));
});

export default router;