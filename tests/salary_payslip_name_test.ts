import { describe, expect, it } from "vitest";

import { buildPayslipPath, extensionOf } from "../src/data/salary/payslip-name";

const BASE = {
  employerName: "Acme AB",
  fallbackLabel: "Payslip",
  month: "2024-01",
  salaryId: "a1b2c3d4e5",
  extension: "pdf",
  usedPaths: new Set<string>(),
};

describe("buildPayslipPath", () => {
  it("names the file from the employer and pay month", () => {
    expect(buildPayslipPath(BASE)).toBe("Acme AB - 2024-01.pdf");
  });

  it("falls back to the label when the salary has no employer", () => {
    expect(buildPayslipPath({ ...BASE, employerName: undefined })).toBe(
      "Payslip - 2024-01.pdf",
    );
    expect(buildPayslipPath({ ...BASE, employerName: "" })).toBe(
      "Payslip - 2024-01.pdf",
    );
  });

  it("omits the extension when none is given", () => {
    expect(buildPayslipPath({ ...BASE, extension: "" })).toBe(
      "Acme AB - 2024-01",
    );
  });

  it("strips path separators and illegal characters from the employer", () => {
    expect(
      buildPayslipPath({ ...BASE, employerName: 'A/B: weird*name?"<>|' }),
    ).toBe("A B weird name - 2024-01.pdf");
  });

  it("appends a short id suffix when the name collides", () => {
    const usedPaths = new Set(["Acme AB - 2024-01.pdf"]);
    expect(buildPayslipPath({ ...BASE, usedPaths })).toBe(
      "Acme AB - 2024-01 (a1b2c3).pdf",
    );
  });

  it("re-exports extensionOf for the caller", () => {
    expect(extensionOf("Lonebesked.PDF")).toBe("pdf");
  });
});
