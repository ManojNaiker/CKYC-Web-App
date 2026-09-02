import type { ClientInput } from "@workspace/api-client-react";

export const LMS_HEADERS = [
  "loanid",
  "ClientID",
  "disbursedon_date",
  "Client_UID",
  "Client_VID",
  "Client_PAN",
  "ClientName",
  "mobile_no",
  "alternate_mobile_no",
  "Gender",
  "date_of_birth",
] as const;

export const REQUIRED_LMS_VALUES = [
  "loanid",
  "ClientID",
  "disbursedon_date",
  "ClientName",
  "mobile_no",
  "Gender",
  "date_of_birth",
] as const;

export type ParsedCsv = {
  headers: string[];
  rows: ClientInput[];
  missingHeaders: string[];
};

function parseRecords(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    record.push(field.trim());
    field = "";
  };

  const pushRecord = () => {
    pushField();
    if (record.some((value) => value !== "")) {
      records.push(record);
    }
    record = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      inQuotes = true;
    } else if (character === ",") {
      pushField();
    } else if (character === "\r" || character === "\n") {
      pushRecord();
      if (character === "\r" && text[index + 1] === "\n") {
        index += 1;
      }
    } else {
      field += character;
    }
  }

  if (inQuotes) {
    throw new Error("The CSV contains an unterminated quoted value.");
  }

  if (field !== "" || record.length > 0) {
    pushRecord();
  }

  return records;
}

export function parseCsv(text: string): ParsedCsv {
  const records = parseRecords(text);
  if (!records.length) {
    return { headers: [], rows: [], missingHeaders: [...LMS_HEADERS] };
  }

  const headers = records[0].map((header, index) =>
    (index === 0 ? header.replace(/^\uFEFF/, "") : header).trim(),
  );
  const rows = records.slice(1).map((values) => {
    const row = Object.fromEntries(
      headers.map((key, index) => [key, values[index] ?? ""]),
    ) as Record<string, string>;

    return {
      loanid: row.loanid ?? "",
      ClientID: row.ClientID ?? "",
      disbursedon_date: row.disbursedon_date ?? "",
      Client_UID: row.Client_UID ?? "",
      Client_VID: row.Client_VID ?? "",
      Client_PAN: row.Client_PAN ?? "",
      ClientName: row.ClientName ?? "",
      mobile_no: row.mobile_no ?? "",
      alternate_mobile_no: row.alternate_mobile_no ?? "",
      Gender: row.Gender ?? "",
      date_of_birth: row.date_of_birth ?? "",
    };
  });

  return {
    headers,
    rows,
    missingHeaders: LMS_HEADERS.filter((header) => !headers.includes(header)),
  };
}