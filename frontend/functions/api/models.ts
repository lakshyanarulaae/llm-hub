export const onRequestGet: PagesFunction = async () => {
  const MODELS: Record<string, { provider: string; api_name: string; display_name: string }> = {
    "gpt-4.1": { provider: "openai", api_name: "gpt-4.1", display_name: "GPT-4.1" },
    "o3": { provider: "openai", api_name: "o3", display_name: "OpenAI o3" },
    "gemini-2.5-pro": { provider: "gemini", api_name: "gemini-2.5-pro", display_name: "Gemini 2.5 Pro" },
    "gemini-2.5-flash": { provider: "gemini", api_name: "gemini-2.5-flash", display_name: "Gemini 2.5 Flash" },
    "claude-sonnet-4.5": { provider: "claude", api_name: "claude-sonnet-4-5-20250929", display_name: "Claude Sonnet 4.5" }
  };

  // ✅ Convert object -> array with an `id` field (what your frontend expects)
  const models = Object.entries(MODELS).map(([id, cfg]) => ({ id, ...cfg }));

  return Response.json({ models });
};