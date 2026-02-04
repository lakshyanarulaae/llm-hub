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

export const onRequestPost: PagesFunction = async ({ env, request }) => {
  const body = (await request.json()) as SaveBody;

  const chatId = body.chat_id ?? uuid();
  const title = body.title ?? "Untitled chat";
  const mode = body.mode ?? "normal";
  const systemPrompt = body.system_prompt ?? null;

  // Upsert chat
  await env.DB.prepare(`
    INSERT INTO chats (id, title, mode, system_prompt, created_at, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      title=excluded.title,
      mode=excluded.mode,
      system_prompt=excluded.system_prompt,
      updated_at=datetime('now')
  `).bind(chatId, title, mode, systemPrompt).run();

  // Replace messages (simple + robust)
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
