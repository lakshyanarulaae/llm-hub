export const onRequestGet: PagesFunction = async ({ env, params }) => {
  const chatId = String(params.chat_id);

  const chat = await env.DB.prepare(
    "SELECT id, title, mode, system_prompt, created_at, updated_at FROM chats WHERE id = ?"
  ).bind(chatId).first();

  if (!chat) return new Response("Chat not found", { status: 404 });

  const { results: messages } = await env.DB.prepare(
    "SELECT id, chat_id, role, content, model, round, metadata, created_at FROM messages WHERE chat_id = ? ORDER BY id ASC"
  ).bind(chatId).all();

  return Response.json({ chat, messages });
};

export const onRequestDelete: PagesFunction = async ({ env, params }) => {
  const chatId = String(params.chat_id);
  await env.DB.prepare("DELETE FROM chats WHERE id = ?").bind(chatId).run();
  return Response.json({ ok: true });
};
