import { describe, expect, it } from "vitest";

import { formDataToObject } from "@/lib/shared/form-data";

describe("formDataToObject", () => {
  it("keeps repeated field names as an array", () => {
    const formData = new FormData();
    formData.append("candidateDates", "2026-07-01T10:00");
    formData.append("candidateDates", "2026-07-02T13:15");
    formData.append("memo", "候補です");

    expect(formDataToObject(formData)).toEqual({
      candidateDates: ["2026-07-01T10:00", "2026-07-02T13:15"],
      memo: "候補です"
    });
  });
});
