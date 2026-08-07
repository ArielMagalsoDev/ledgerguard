import Anthropic from "@anthropic-ai/sdk";

// Default extraction model: Haiku. Structured extraction from a single-page
// invoice is a bounded, well-specified task — the "Classification, summarization,
// extraction, Q&A" row in Anthropic's own surface-selection guidance points at
// a single Claude API call, and this project's spec (CLAUDE.md section 18)
// commits to Haiku for this stage specifically, escalating only if eval
// accuracy demands it. Same call SignalDesk made for its own bounded calls.
export const MODEL = "claude-haiku-4-5";

let cached: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (cached) return cached;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set. See .env.example.");
  }
  cached = new Anthropic({ apiKey });
  return cached;
}
