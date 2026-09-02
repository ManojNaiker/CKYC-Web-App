import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCsv } from "./csv";

const header =
  "loanid,ClientID,disbursedon_date,Client_UID,Client_VID,Client_PAN,ClientName,mobile_no,alternate_mobile_no,Gender,date_of_birth";

describe("LMS CSV parser", () => {
  it("keeps commas inside quoted values in the original column", () => {
    const parsed = parseCsv(
      `${header}\r\nloan-1,CLI-1,01-01-2026,1234,,,\"Doe, Jane\",9876543210,,F,02-04-1990`,
    );

    assert.equal(parsed.rows.length, 1);
    assert.equal(parsed.rows[0].ClientName, "Doe, Jane");
    assert.equal(parsed.rows[0].mobile_no, "9876543210");
    assert.equal(parsed.rows[0].Gender, "F");
    assert.deepEqual(parsed.missingHeaders, []);
  });

  it("unescapes doubled quotes without shifting later columns", () => {
    const parsed = parseCsv(
      `${header}\nloan-2,CLI-2,01-01-2026,1234,,,\"O\"\"Brien\",9876543211,,M,03-05-1991`,
    );

    assert.equal(parsed.rows[0].ClientName, 'O"Brien');
    assert.equal(parsed.rows[0].mobile_no, "9876543211");
    assert.equal(parsed.rows[0].Gender, "M");
    assert.equal(parsed.rows[0].date_of_birth, "03-05-1991");
  });

  it("retains required-header validation for incomplete CSVs", () => {
    const parsed = parseCsv("loanid,ClientID,ClientName\nloan-3,CLI-3,Client");

    assert.deepEqual(parsed.missingHeaders, [
      "disbursedon_date",
      "Client_UID",
      "Client_VID",
      "Client_PAN",
      "mobile_no",
      "alternate_mobile_no",
      "Gender",
      "date_of_birth",
    ]);
    assert.equal(parsed.rows[0].ClientName, "Client");
  });
});