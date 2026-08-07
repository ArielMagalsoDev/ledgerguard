import type { Metadata } from "next";
import { Workbench } from "@/app/demo/workbench";
import { getAllLiveScenarios } from "@/lib/queue/live-scenario";

export const metadata: Metadata = {
  title: "AP Workbench — Ledger Guard demo",
  description: "Five guided fictional invoice scenarios, evidence-linked end to end.",
};

// Phase 6: each scenario now carries REAL pipeline output (extraction,
// matching, controls, decision, audit trail) whenever `npm run
// run-demo-pipeline` has populated it — read once, server-side, per page
// load. Falls back to the static fixture per-scenario if a live row isn't
// there yet, so this never breaks a fresh environment.
export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<{ scenario?: string }>;
}) {
  const params = await searchParams;
  const scenarios = await getAllLiveScenarios();
  const uploadSandboxEnabled = process.env.UPLOAD_SANDBOX_ENABLED === "true";
  return (
    <Workbench
      scenarios={scenarios}
      initialScenarioId={params.scenario}
      uploadSandboxEnabled={uploadSandboxEnabled}
    />
  );
}
