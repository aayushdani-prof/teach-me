// Agent bridge (Option A): calls an OpenAI-compatible API with the skill's prompts.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { OPENAI_API_KEY, OPENAI_BASE_URL, MODEL } from "./config.js";

const ROOT = process.cwd();
const systemFor = (name) => readFileSync(join(ROOT, "prompts", `${name}.md`), "utf8");

export async function chat(messages, { system = "teach_system", model = MODEL } = {}) {
  if (!OPENAI_API_KEY) throw new Error("No API key found in ~/.teachme/.env");
  const res = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: systemFor(system) }, ...messages],
      temperature: 0.4,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`agent API ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}
