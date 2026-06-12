import { describe, it, expect } from "vitest";
import { rawZplData } from "@/lib/checkin/print-client";

describe("rawZplData", () => {
  it("wraps ZPL as a single raw/plain print job", () => {
    const data = rawZplData("^XA^XZ");
    expect(data).toEqual([{ type: "raw", format: "plain", data: "^XA^XZ" }]);
  });
});
