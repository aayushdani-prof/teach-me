// Agent bridge (Option A): calls an OpenAI-compatible API with the skill's prompts.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { OPENAI_API_KEY, OPENAI_BASE_URL, MODEL } from "./config.js";

const ROOT = process.cwd();
const systemFor = (name) => readFileSync(join(ROOT, "prompts", `${name}.md`), "utf8");

export async function chat(messages, { system = "teach_system", model = MODEL, temperature = 0.4 } = {}) {
  if (!OPENAI_API_KEY) throw new Error("No API key found in ~/.teachme/.env");
  const res = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: systemFor(system) }, ...messages],
      temperature,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`agent API ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

export async function extractGaps(conceptTitle, thread) {
  const conversation = thread
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n");
  const reply = await chat(
    [
      { role: "system", content: `Concept being taught: ${conceptTitle}` },
      { role: "user", content: conversation },
    ],
    { system: "gap_extractor", temperature: 0 }
  );
  try {
    const cleaned = reply.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed.gaps) ? parsed.gaps : [];
  } catch {
    return [];
  }
}
