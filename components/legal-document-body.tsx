import React from "react";

import type { LegalSection } from "@/lib/legal-documents";

export function LegalDocumentBody({
  sections,
  headingLevel = "h2"
}: {
  sections: LegalSection[];
  headingLevel?: "h2" | "h3";
}) {
  const Heading = headingLevel;

  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <section key={section.title}>
          <Heading className="text-lg font-bold text-ink">{section.title}</Heading>
          <p className="mt-2 text-sm leading-7 text-muted">{section.body}</p>
        </section>
      ))}
    </div>
  );
}
