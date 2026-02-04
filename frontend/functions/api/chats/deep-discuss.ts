export const onRequestPost: PagesFunction = async ({ request, env }) => {
  try {
    const body = await request.json();

    // Expect your frontend sends something like:
    // { prompt, modelA, modelB, rounds, ... }
    // You can log/inspect body later.

    const openaiKey = env.OPENAI_API_KEY;
    const googleKey = env.GOOGLE_API_KEY;

    if (!openaiKey && !googleKey) {
      return new Response("Missing API keys in environment variables", { status: 500 });
    }

    // TEMP: return echo so UI stops failing
    // (Next step: implement actual OpenAI/Gemini calls)
    return Response.json({
      ok: true,
      note: "Endpoint wired. Next: implement model calls.",
      received: body
    });
  } catch (e: any) {
    return new Response(e?.message || "Server error", { status: 500 });
  }
};
