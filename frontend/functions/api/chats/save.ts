type SaveBody = {
  chat_id?: string;
  title?: string;
  mode: string;
  system_prompt?: string | null;
  messages: Array<{
    role: string;
    content: string;
    model?: string;
    round?: number;
    metadata?: any;
  }>;
};

function uuid() {
  return crypto.randomUUID();
}

function getUserId(request: Request) {
  const userId = request.headers.get("X-User-Id")?.trim();
  if (!userId) throw new Error("Missing X-User-Id");
  return userId;
}

export const onRequestPost: PagesFunction = async ({ env, request }) => {
  const userId = getUserId(request);
  const body = (await request.json()) as SaveBody;

  const chatId = body.chat_id ?? uuid();
  const title = body.title ?? "Untitled chat";
  const mode = body.mode ?? "normal";
  const systemPrompt = body.system_prompt ?? null;

  // If updating an existing chat, ensure it belongs to this user
  const existing = await env.DB.prepare(
    "SELECT id FROM chats WHERE id = ?"
  ).bind(chatId).first();

  if (existing) {
    const owned = await env.DB.prepare(
      "SELECT id FROM chats WHERE id = ? AND user_id = ?"
    ).bind(chatId, userId).first();

    if (!owned) {
      return new Response("Forbidden: chat does not belong to this user", { status: 403 });
    }
  }

  // Upsert chat (now includes user_id)
  await env.DB.prepare(`
    INSERT INTO chats (id, title, mode, system_prompt, user_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      title=excluded.title,
      mode=excluded.mode,
      system_prompt=excluded.system_prompt,
      user_id=excluded.user_id,
      updated_at=datetime('now')
  `).bind(chatId, title, mode, systemPrompt, userId).run();

  // Replace messages
  await env.DB.prepare("DELETE FROM messages WHERE chat_id = ?").bind(chatId).run();

  const stmt = env.DB.prepare(`
    INSERT INTO messages (chat_id, role, content, model, round, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  for (const m of body.messages ?? []) {
    await stmt.bind(
      chatId,
      m.role,
      m.content,
      m.model ?? null,
      m.round ?? null,
      m.metadata ? JSON.stringify(m.metadata) : null
    ).run();
  }

  return Response.json({ ok: true, chat_id: chatId });
};
