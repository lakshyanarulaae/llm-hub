type DeepDiscussBody = {
  prompt: string;
  model_a: string;
  model_b: string;
  max_rounds?: number;
  system_prompt?: string;
};

type Env = {
  OPENAI_API_KEY?: string;
  GOOGLE_API_KEY?: string;
};

const MODEL_META: Record<string, { provider: "openai" | "gemini"; api: string; name: string }> = {
  "gpt-4.1": { provider: "openai", api: "gpt-4.1", name: "GPT-4.1" },
  "o3": { provider: "openai", api: "o3", name: "OpenAI o3" },

  "gemini-2.5-pro": { provider: "gemini", api: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
  "gemini-2.5-flash": { provider: "gemini", api: "gemini-2.5-flash", name: "Gemini 2.5 Flash" }
};

function ndjsonLine(obj: any) {
  return JSON.stringify(obj) + "\n";
}

async function callOpenAI(env: Env, modelId: string, messages: Array<{ role: string; content: string }>) {
  const key = env.OPENAI_API_KEY;
  if (!key) throw new Error("Missing OPENAI_API_KEY");

  const meta = MODEL_META[modelId];
  const payload = {
    model: meta?.api ?? modelId,
    messages
  };

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const text = await r.text();
  if (!r.ok) throw new Error(`OpenAI error ${r.status}: ${text.slice(0, 400)}`);

  const json = JSON.parse(text);
  const content =
    json?.choices?.[0]?.message?.content ??
    json?.choices?.[0]?.delta?.content ??
    "";

  return { content: String(content || ""), full_json: json };
}

async function callGemini(env: Env, modelId: string, messages: Array<{ role: string; content: string }>) {
  const key = env.GOOGLE_API_KEY;
  if (!key) throw new Error("Missing GOOGLE_API_KEY");

  const meta = MODEL_META[modelId];
  const modelApi = meta?.api ?? modelId;

  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }]
  }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    modelApi
  )}:generateContent?key=${encodeURIComponent(key)}`;

  const payload = {
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1024
    }
  };

  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const text = await r.text();
  if (!r.ok) throw new Error(`Gemini error ${r.status}: ${text.slice(0, 400)}`);

  const json = JSON.parse(text);

  const parts = json?.candidates?.[0]?.content?.parts;
  const extracted = Array.isArray(parts)
    ? parts.map((p: any) => p?.text ?? "").join("")
    : (json?.candidates?.[0]?.content?.text ?? "");

  let finalText = String(extracted || "").trim();

if (!finalText) {
  // ✅ Retry once with minimal context (only the last user message)
  const lastUser = [...messages].reverse().find(m => m.role !== "assistant")?.content ?? "";

  const payload2 = {
    contents: [{ role: "user", parts: [{ text: lastUser }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
  };

  const r2 = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload2)
  });

  const t2 = await r2.text();
  if (!r2.ok) throw new Error(`Gemini retry error ${r2.status}: ${t2.slice(0, 400)}`);

  const j2 = JSON.parse(t2);
  const parts2 = j2?.candidates?.[0]?.content?.parts;
  const extracted2 = Array.isArray(parts2)
    ? parts2.map((p: any) => p?.text ?? "").join("")
    : "";

  finalText = String(extracted2 || "").trim();

  if (!finalText) throw new Error("Gemini returned empty content.");
  return { content: finalText, full_json: j2 };
}

return { content: finalText, full_json: json };

}

async function callModel(env: Env, modelId: string, messages: Array<{ role: string; content: string }>) {
  const meta = MODEL_META[modelId];
  if (!meta) throw new Error(`Unknown model: ${modelId}`);

  if (meta.provider === "openai") return callOpenAI(env, modelId, messages);
  if (meta.provider === "gemini") return callGemini(env, modelId, messages);

  throw new Error(`Unsupported provider for model: ${modelId}`);
}

function looksConverged(text: string) {
  const t = (text || "").toLowerCase();

  // Strong stop signals
  if (t.includes("converged") || t.includes("no further") || t.includes("no major") || t.includes("no significant")) return true;

  // If critique is very short, it's usually minor
  const wordCount = t.split(/\s+/).filter(Boolean).length;
  if (wordCount <= 30) return true;

  // If it explicitly says "correct" + "minor" etc.
  if ((t.includes("correct") || t.includes("accurate")) && (t.includes("minor") || t.includes("small") || t.includes("nit") || t.includes("optional"))) {
    return true;
  }

  return false;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = (await request.json()) as DeepDiscussBody;

  const prompt = (body?.prompt ?? "").trim();
  const modelA = body?.model_a;
  const modelB = body?.model_b;
  const maxRounds = Math.max(1, Math.min(10, Number(body?.max_rounds ?? 3))); // cap at 10
  const systemPrompt = (body?.system_prompt ?? "").trim();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: any) => controller.enqueue(new TextEncoder().encode(ndjsonLine(obj)));

      try {
        if (!prompt) {
          send({ type: "status", msg: "Error: empty prompt." });
          controller.close();
          return;
        }
        if (!MODEL_META[modelA] || !MODEL_META[modelB]) {
          send({ type: "status", msg: "Error: unknown model selection." });
          controller.close();
          return;
        }

        send({ type: "status", msg: "Initializing Research Protocol..." });

        // Shared transcript for the debate
        const transcript: Array<{ role: string; content: string }> = [];
        if (systemPrompt) transcript.push({ role: "system", content: systemPrompt });
        transcript.push({ role: "user", content: prompt });

        for (let round = 1; round <= maxRounds; round++) {
          // A speaks
          send({ type: "status", msg: `Round ${round}/${maxRounds}: ${MODEL_META[modelA].name} is responding...` });
          const a = await callModel(env, modelA, transcript);
          transcript.push({ role: "assistant", content: a.content });

          send({
            type: "exchange",
            data: {
              role: "assistant",
              model: modelA,
              model_name: MODEL_META[modelA].name,
              content: a.content,
              full_json: a.full_json,
              exchange: round,
              type: "critique"
            }
          });

          // B speaks
          send({ type: "status", msg: `Round ${round}/${maxRounds}: ${MODEL_META[modelB].name} is responding...` });
          const judgeMessages: Array<{ role: string; content: string }> = [
            { role: "system", content: "You are a strict reviewer. If the answer is essentially correct and only minor optional details remain, respond with 'CONVERGED' and then a 1–2 sentence note. If there are material errors/omissions, list them clearly and suggest the corrected final answer." },
            { role: "user", content: `Question: ${prompt}\n\nAnswer from Model A:\n${a.content}\n\nReview:` }
            ];

          const b = await callModel(env, modelB, judgeMessages);
          transcript.push({ role: "assistant", content: b.content });

          send({
            type: "exchange",
            data: {
              role: "assistant",
              model: modelB,
              model_name: MODEL_META[modelB].name,
              content: b.content,
              full_json: b.full_json,
              exchange: round,
              type: "critique"
            }
          });
          if (looksConverged(b.content)) {
            send({ type: "status", msg: "Converged early. Stopping." });
            break;
        }

        send({ type: "status", msg: "Completed." });
        controller.close();
      } catch (e: any) {
        send({ type: "status", msg: `Error: ${e?.message ?? "Unknown error"}` });
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache"
    }
  });
};
