import { describe, expect, it } from "vitest";
import { extractJobPosting } from "@/lib/integrations/job-sources/json-ld";

const page = (data: unknown) =>
  `<html><head><script type="application/ld+json">${JSON.stringify(data)}</script></head><body></body></html>`;

describe("extractJobPosting", () => {
  it("reads a typical JobPosting", () => {
    const draft = extractJobPosting(
      page({
        "@context": "https://schema.org",
        "@type": "JobPosting",
        title: "Senior iOS Engineer",
        hiringOrganization: { "@type": "Organization", name: "Acme" },
        jobLocation: [{ "@type": "Place", address: { addressLocality: "Manila", addressCountry: "PH" } }],
        jobLocationType: "TELECOMMUTE",
        employmentType: ["FULL_TIME"],
        baseSalary: {
          "@type": "MonetaryAmount",
          currency: "PHP",
          value: { "@type": "QuantitativeValue", minValue: 150000, maxValue: 200000, unitText: "MONTH" },
        },
        datePosted: "2026-11-10",
        description: "<p>Build &amp; ship.</p>",
      }),
    );
    expect(draft).toEqual({
      title: "Senior iOS Engineer",
      company: "Acme",
      location: "Manila, PH",
      remoteType: "remote",
      employmentType: "full_time",
      salaryMin: 150000,
      salaryMax: 200000,
      salaryCurrency: "PHP",
      salaryPeriod: "month",
      description: "Build & ship.",
      postedAt: "2026-11-10T00:00:00.000Z",
    });
  });

  it("finds postings inside @graph and skips unrelated or broken blocks", () => {
    const html =
      `<script type="application/ld+json">{ broken</script>` +
      page({ "@graph": [{ "@type": "WebPage" }, { "@type": ["JobPosting"], title: "Dev", hiringOrganization: "Org" }] });
    expect(extractJobPosting(html)).toMatchObject({ title: "Dev", company: "Org", remoteType: "unknown" });
  });

  it("returns null when there is no usable posting", () => {
    expect(extractJobPosting("<html></html>")).toBeNull();
    expect(extractJobPosting(page({ "@type": "JobPosting", title: "No company" }))).toBeNull();
  });
});
