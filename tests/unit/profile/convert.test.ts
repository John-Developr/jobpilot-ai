import { describe, expect, it } from "vitest";
import {
  dateToMonth,
  emptyToNull,
  formatMonth,
  formatMonthRange,
  monthToDate,
  nullToEmpty,
} from "@/features/profile/convert";

describe("profile conversions", () => {
  it("maps empty text to NULL and back", () => {
    expect(emptyToNull("")).toBeNull();
    expect(emptyToNull("x")).toBe("x");
    expect(nullToEmpty(null)).toBe("");
  });

  it("round-trips months through dates", () => {
    expect(monthToDate("2024-07")).toBe("2024-07-01");
    expect(monthToDate("")).toBeNull();
    expect(dateToMonth("2024-07-01")).toBe("2024-07");
    expect(dateToMonth(null)).toBe("");
  });

  it("formats months independent of the host timezone", () => {
    expect(formatMonth("2024-01")).toBe("Jan 2024");
    expect(formatMonth("")).toBe("");
  });

  it("formats ranges", () => {
    expect(formatMonthRange("2023-07", "", true)).toBe("Jul 2023 – Present");
    expect(formatMonthRange("2015-07", "2021-07")).toBe("Jul 2015 – Jul 2021");
    expect(formatMonthRange("", "2021-07")).toBe("Jul 2021");
    expect(formatMonthRange("", "")).toBe("");
  });
});
