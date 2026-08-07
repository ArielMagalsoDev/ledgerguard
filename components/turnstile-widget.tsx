"use client";

import Script from "next/script";
import { useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: { sitekey: string; callback: (token: string) => void; "expired-callback"?: () => void }
      ) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

/**
 * Cloudflare Turnstile widget for the upload sandbox (CLAUDE.md section 18
 * — real keys before any public endpoint that spends model budget ships
 * widely). Renders nothing when no site key is configured, matching
 * lib/upload/turnstile.ts's server-side pass-through — same documented
 * gap, not two different behaviors to keep in sync.
 */
export function TurnstileWidget({ onToken }: { onToken: (token: string | null) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  if (!siteKey) return null;

  function renderWidget() {
    if (!containerRef.current || !window.turnstile || widgetIdRef.current) return;
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey!,
      callback: (token) => onToken(token),
      "expired-callback": () => onToken(null),
    });
  }

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
        onLoad={() => {
          setScriptLoaded(true);
          renderWidget();
        }}
      />
      <div ref={containerRef} data-loaded={scriptLoaded} />
    </>
  );
}
