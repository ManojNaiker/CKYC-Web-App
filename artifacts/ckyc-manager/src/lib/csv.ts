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

export type ParsedClientSelectionCsv = {
  header: string;
  references: string[];
};

const CLIENT_REFERENCE_HEADERS = [
  "LMS CLIENT ID",
  "CLIENTID",
  "CLIENT ID",
  "LOANID",
  "LOAN ID",
  "CKYC RESPONSE ID",
  "ALPHANUMERIC REFERENCE NO",
];

function normalizeSelectionHeader(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

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

export function parseClientSelectionCsv(text: string): ParsedClientSelectionCsv {
  const records = parseRecords(text);
  if (!records.length) {
    throw new Error(
      "The client file is empty. Upload a CSV with an LMS Client ID, Loan ID, or CKYC Response ID column.",
    );
  }

  const headers = records[0].map((header, index) =>
    (index === 0 ? header.replace(/^\uFEFF/, "") : header).trim(),
  );
  const headerIndex = CLIENT_REFERENCE_HEADERS.reduce(
    (selectedIndex, supportedHeader) => {
      if (selectedIndex !== -1) return selectedIndex;
      return headers.findIndex(
        (header) => normalizeSelectionHeader(header) === supportedHeader,
      );
    },
    -1,
  );
  if (headerIndex === -1) {
    throw new Error(
      "The client file must contain LMS Client ID, Loan ID, or CKYC Response ID.",
    );
  }

  const references = [
    ...new Set(
      records
        .slice(1)
        .map((values) => values[headerIndex] ?? "")
        .map((value) => value.trim().replace(/^'/, ""))
        .filter(Boolean),
    ),
  ];
  if (!references.length) {
    throw new Error("The client file does not contain any client references.");
  }

  return { header: headers[headerIndex], references };
}