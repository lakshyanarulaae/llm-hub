export const onRequestPost: PagesFunction = async ({ request }) => {
  const form = await request.formData();
  const file = form.get("file");

  // Keep behavior consistent with your current backend placeholder.
  const filename = (file && typeof file === "object" && "name" in file) ? (file as File).name : "uploaded.pdf";
  return Response.json({ filename, text: "PDF Content" });
};