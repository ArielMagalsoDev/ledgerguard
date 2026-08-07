import type { Metadata } from "next";
import { Workbench } from "@/app/demo/workbench";

export const metadata: Metadata = {
  title: "AP Workbench — LedgerGuard demo",
  description: "Five guided fictional invoice scenarios, evidence-linked end to end.",
};

export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<{ scenario?: string }>;
}) {
  const params = await searchParams;
  return <Workbench initialScenarioId={params.scenario} />;
}
