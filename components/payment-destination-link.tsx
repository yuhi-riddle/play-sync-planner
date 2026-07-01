import React from "react";
import { ExternalLink } from "lucide-react";

export function PaymentDestinationLink({
  href,
  label,
  detail,
  className = ""
}: {
  href: string | null | undefined;
  label: string;
  detail?: string | null;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-start gap-1 ${className}`}>
      {href ? (
        <a
          className="inline-flex min-h-9 items-center justify-center rounded-full border border-moss/28 bg-white/82 px-4 py-1 text-xs font-bold text-pine transition-colors hover:border-pine hover:bg-mist/45 focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
          href={href}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink aria-hidden="true" className="mr-2 h-3.5 w-3.5" />
          {label}
        </a>
      ) : null}
      {detail ? <span className="text-xs leading-5 text-ink/55">{detail}</span> : null}
    </div>
  );
}
