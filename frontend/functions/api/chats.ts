export const onRequestGet: PagesFunction = async ({ env }) => {
  const { results } = await env.DB.prepare(
    "SELECT id, title, mode, system_prompt, created_at, updated_at FROM chats ORDER BY updated_at DESC"
  ).all();

  return Response.json({ chats: results });
};
