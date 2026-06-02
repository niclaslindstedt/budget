import { describe, expect, it } from "vitest";

import { effectiveMimeType, mimeTypeFromFilename } from "../src/utils/mime";

describe("mimeTypeFromFilename", () => {
  it("maps known image and pdf extensions", () => {
    expect(mimeTypeFromFilename("Acme - 2024-01.pdf")).toBe("application/pdf");
    expect(mimeTypeFromFilename("Acme - 2024-01.jpg")).toBe("image/jpeg");
    expect(mimeTypeFromFilename("Acme - 2024-01.JPEG")).toBe("image/jpeg");
    expect(mimeTypeFromFilename("Acme - 2024-01.png")).toBe("image/png");
    expect(mimeTypeFromFilename("Acme - 2024-01.heic")).toBe("image/heic");
  });

  it("returns empty for unknown or missing extensions", () => {
    expect(mimeTypeFromFilename("payslip")).toBe("");
    expect(mimeTypeFromFilename("payslip.xyz")).toBe("");
  });
});

describe("effectiveMimeType", () => {
  it("trusts a concrete blob type", () => {
    const blob = new Blob(["x"], { type: "image/png" });
    expect(effectiveMimeType(blob, "Acme - 2024-01.pdf")).toBe("image/png");
  });

  it("falls back to the filename when the blob type is octet-stream", () => {
    const blob = new Blob(["x"], { type: "application/octet-stream" });
    expect(effectiveMimeType(blob, "Acme - 2024-01.pdf")).toBe(
      "application/pdf",
    );
  });

  it("falls back to the filename when the blob type is empty", () => {
    const blob = new Blob(["x"]);
    expect(effectiveMimeType(blob, "Acme - 2024-01.jpg")).toBe("image/jpeg");
  });
});
