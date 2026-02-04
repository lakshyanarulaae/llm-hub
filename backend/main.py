"""
LLM Discussion Hub - Backend API (Strict Cleaning & Robust Parsing)
"""
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import os, json, asyncio, httpx, time, base64, io, uuid, sqlite3, re, traceback
from datetime import datetime
from contextlib import contextmanager
from dotenv import load_dotenv

# --- IMPORTS FOR PDF/EXPORT ---
try:
    import pypdf
    PDF_SUPPORT = True
except ImportError:
    PDF_SUPPORT = False

try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    from reportlab.lib.colors import HexColor
    PDF_EXPORT_SUPPORT = True
except ImportError:
    PDF_EXPORT_SUPPORT = False

load_dotenv()
app = FastAPI(title="LLM Discussion Hub")

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# --- CONFIG ---
MODELS = {
    "gpt-4.1": {"provider": "openai", "api_name": "gpt-4.1", "display_name": "GPT-4.1"},
    "o3": {"provider": "openai", "api_name": "o3", "display_name": "OpenAI o3"},
    "gemini-2.5-pro": {"provider": "gemini", "api_name": "gemini-2.5-pro", "display_name": "Gemini 2.5 Pro"},
    "gemini-2.5-flash": {"provider": "gemini", "api_name": "gemini-2.5-flash", "display_name": "Gemini 2.5 Flash"},
    "claude-sonnet-4.5": {"provider": "claude", "api_name": "claude-sonnet-4-5-20250929", "display_name": "Claude Sonnet 4.5"},
}

DATABASE_PATH = DATABASE_PATH = os.getenv(
    "DATABASE_PATH",
    os.path.join(os.path.dirname(__file__), "chats.db")
)

# --- DATABASE ---
def init_database():
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    cursor.execute("CREATE TABLE IF NOT EXISTS chats (id TEXT PRIMARY KEY, title TEXT, mode TEXT, system_prompt TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
    cursor.execute("CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id TEXT, role TEXT, content TEXT, model TEXT, round INTEGER, metadata TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (chat_id) REFERENCES chats (id) ON DELETE CASCADE)")
    conn.commit()
    conn.close()

init_database()

@contextmanager
def get_db():
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    try: yield conn
    finally: conn.close()

# --- MODELS ---
class Message(BaseModel):
    role: str
    content: str
    model: Optional[str] = None
    round: Optional[int] = None
    metadata: Optional[Dict] = None

class DeepDiscussRequest(BaseModel):
    prompt: str
    model_a: str
    model_b: str
    max_rounds: int = 5
    conversation_history: List[Message] = []
    system_prompt: Optional[str] = None
    pdf_text: Optional[str] = None

class ChatSaveRequest(BaseModel):
    chat_id: Optional[str] = None
    title: Optional[str] = None
    mode: str
    system_prompt: Optional[str] = None
    messages: List[dict]

class NormalRequest(BaseModel):
    prompt: str
    model: str
    conversation_history: List[Message] = []
    system_prompt: Optional[str] = None
    stream: bool = False
    pdf_text: Optional[str] = None

# --- LLM CLIENT ---
class LLMClient:
    def __init__(self):
        self.keys = { "openai": os.getenv("OPENAI_API_KEY"), "gemini": os.getenv("GOOGLE_API_KEY"), "claude": os.getenv("ANTHROPIC_API_KEY") }

    async def generate(self, model_id: str, prompt: str, history: List[dict] = [], system_prompt: str = "") -> str:
        config = MODELS.get(model_id)
        if not config: return f"Error: Unknown model {model_id}"
        provider, key = config["provider"], self.keys.get(config["provider"])
        
        async with httpx.AsyncClient(timeout=120.0) as client:
            try:
                if provider == "openai":
                    msgs = [{"role": "system", "content": system_prompt}] + history + [{"role": "user", "content": prompt}]
                    res = await client.post("https://api.openai.com/v1/chat/completions", headers={"Authorization": f"Bearer {key}"}, json={"model": config["api_name"], "messages": msgs})
                    return res.json()["choices"][0]["message"]["content"]
                elif provider == "gemini":
                    contents = [{"role": "user" if m["role"]=="user" else "model", "parts": [{"text": m["content"]}]} for m in history]
                    contents.append({"role": "user", "parts": [{"text": prompt}]})
                    res = await client.post(f"https://generativelanguage.googleapis.com/v1beta/models/{config['api_name']}:generateContent?key={key}", json={"contents": contents, "system_instruction": {"parts": [{"text": system_prompt}]}})
                    return res.json()["candidates"][0]["content"]["parts"][0]["text"]
                elif provider == "claude":
                    msgs = history + [{"role": "user", "content": prompt}]
                    res = await client.post("https://api.anthropic.com/v1/messages", headers={"x-api-key": key, "anthropic-version": "2023-06-01"}, json={"model": config["api_name"], "messages": msgs, "max_tokens": 4096, "system": system_prompt})
                    return res.json()["content"][0]["text"]
            except Exception as e:
                print(f"LLM Error ({provider}): {str(e)}")
                return f"Error: {str(e)}"

    async def stream(self, model_id: str, prompt: str, history: List[dict], system_prompt: str):
        config = MODELS.get(model_id)
        key = self.keys.get(config["provider"])
        if config["provider"] == "openai":
            async with httpx.AsyncClient() as client:
                msgs = [{"role": "system", "content": system_prompt}] + history + [{"role": "user", "content": prompt}]
                async with client.stream("POST", "https://api.openai.com/v1/chat/completions", headers={"Authorization": f"Bearer {key}"}, json={"model": config["api_name"], "messages": msgs, "stream": True}) as response:
                    async for line in response.aiter_lines():
                        if line.startswith("data: ") and line != "data: [DONE]":
                            try: yield json.loads(line[6:])["choices"][0]["delta"].get("content", "")
                            except: pass

llm = LLMClient()

# --- DEEP DISCUSS ---
ADVERSARIAL_PROMPT = """
You are a critical technical reviewer. Review the previous solution rigorously.

IMPORTANT: 
- If the solution is factually correct, complete, and optimal, DO NOT NITPICK.
- If it is perfect, leave "negative_points" empty and write "CONVERGED" in Part 2.

Structure your response in TWO PARTS:

--- PART 1: METADATA (JSON) ---
Output a valid JSON object with these fields:
{
    "positive_points": ["List of string points"],
    "negative_points": ["List of string points (Empty if perfect)"],
    "critique": "A short plain text summary paragraph."
}

--- PART 2: IMPROVED SOLUTION (MARKDOWN) ---
After the JSON object is closed, output the FULLY REWRITTEN CODE/SOLUTION.
If you found NO issues (empty negative_points), simply write: CONVERGED
"""

def clean_solution_text(text: str) -> Optional[str]:
    """
    Cleans up the raw solution text extracted after the JSON block.
    Removes common headers, 'CONVERGED' signals, and whitespace.
    """
    if not text:
        return None
    
    # 1. Remove Markdown code blocks wrapping the whole thing
    text = re.sub(r'^```[a-zA-Z]*\n', '', text)
    text = re.sub(r'\n```$', '', text)
    
    # 2. Remove "Part 2" headers
    text = re.sub(r'-+\s*PART 2.*?-+', '', text, flags=re.IGNORECASE)
    text = re.sub(r'IMPROVED SOLUTION.*?:', '', text, flags=re.IGNORECASE)
    
    # 3. Remove "CONVERGED" signals
    text = re.sub(r'\bCONVERGED\b', '', text, flags=re.IGNORECASE)
    
    text = text.strip()
    return text if len(text) > 10 else None  # Return None if it's just empty/noise

@app.post("/chat/deep-discuss")
async def deep_discuss(req: DeepDiscussRequest):
    async def event_generator():
        try:
            yield json.dumps({"type": "status", "msg": "Generating initial draft..."}) + "\n"
            base_prompt = f"Context:\n{req.pdf_text}\n\nQuestion: {req.prompt}" if req.pdf_text else req.prompt
            
            # 1. Initial Solution
            sol = await llm.generate(req.model_a, f"Task: {base_prompt}\n\nProvide full solution/code.", [], req.system_prompt or "Expert.")
            init_ex = {"exchange": 0, "model": req.model_a, "model_name": MODELS[req.model_a]['display_name'], "content": sol, "full_json": None, "type": "initial"}
            yield json.dumps({"type": "exchange", "data": init_ex}) + "\n"
            
            curr, other, history, converged = req.model_b, req.model_a, [init_ex], False

            # 2. Debate Loop
            for i in range(1, req.max_rounds + 1):
                try:
                    yield json.dumps({"type": "status", "msg": f"Round {i}: {MODELS[curr]['display_name']} critiquing..."}) + "\n"
                    raw = await llm.generate(curr, f"Original: {base_prompt}\n\nCurrent Solution:\n{sol}\n\nCritique & Improve.", [], ADVERSARIAL_PROMPT)
                    
                    try:
                        # Find JSON block (non-greedy)
                        json_match = re.search(r'\{[\s\S]*?\}', raw)
                        
                        if json_match:
                            json_str = json_match.group(0)
                            # Ensure it's valid JSON
                            data = json.loads(json_str)
                            
                            # Everything AFTER the JSON is potential code
                            raw_solution = raw[json_match.end():]
                            data['better_solution'] = clean_solution_text(raw_solution)
                        else:
                            # Fallback if no JSON found
                            raise ValueError("No JSON found")
                    except Exception:
                        # Fallback: Treat entire output as critique if parsing fails
                        data = {"critique": raw[:500], "better_solution": None, "positive_points": [], "negative_points": []}

                    ex_data = {"exchange": i, "model": curr, "model_name": MODELS[curr]['display_name'], "content": data.get("critique"), "full_json": data, "type": "critique"}
                    history.append(ex_data)
                    yield json.dumps({"type": "exchange", "data": ex_data}) + "\n"

                    # Check Convergence
                    # 1. Explicit empty negative points
                    is_perfect = isinstance(data.get("negative_points"), list) and len(data.get("negative_points")) == 0
                    # 2. "CONVERGED" keyword in the raw text
                    is_signaled = "CONVERGED" in raw.upper()
                    
                    if is_perfect or is_signaled:
                        converged = True
                        yield json.dumps({"type": "status", "msg": "Consensus reached! Finalizing..."}) + "\n"
                        
                        # Emit the FINAL ANSWER (The accumulation of the best solution so far)
                        final_ex = {
                            "exchange": i + 1, 
                            "model": curr, 
                            "model_name": "System Consensus", 
                            "content": "The models have reached an agreement.", 
                            "full_json": {"better_solution": sol}, # Use the last known good solution
                            "type": "final"
                        }
                        yield json.dumps({"type": "exchange", "data": final_ex}) + "\n"
                        break
                    
                    # Update global solution ONLY if we have a valid, non-empty better solution
                    if data.get("better_solution"):
                        sol = data["better_solution"]
                    
                    curr, other = other, curr
                    
                except Exception as e:
                    print(f"Error in round {i}: {e}")
                    # Continue debate even if one round errors out
                    continue

            # 3. Finalization (if no convergence)
            if not converged:
                yield json.dumps({"type": "status", "msg": "Synthesizing final answer..."}) + "\n"
                final = await llm.generate(req.model_a, f"Synthesize final answer from debate history.", [{"role": "user", "content": str(history)}], "Neutral Judge")
                yield json.dumps({"type": "exchange", "data": {"exchange": req.max_rounds + 1, "model": req.model_a, "model_name": "System Judge", "content": "Final Synthesis", "full_json": {"better_solution": final}, "type": "synthesis"}}) + "\n"
            
            yield json.dumps({"type": "done", "converged": converged}) + "\n"
            
        except Exception as e:
            traceback.print_exc()
            yield json.dumps({"type": "error", "msg": str(e)}) + "\n"

    return StreamingResponse(event_generator(), media_type="application/x-ndjson")

@app.post("/chat/normal")
async def chat_normal(req: NormalRequest):
    if req.stream:
        return StreamingResponse(llm.stream(req.model, req.prompt, [{"role":m.role,"content":m.content} for m in req.conversation_history], req.system_prompt or ""), media_type="text/event-stream")
    resp = await llm.generate(req.model, req.prompt, [{"role":m.role,"content":m.content} for m in req.conversation_history], req.system_prompt or "")
    return {"response": resp, "model": req.model}

@app.post("/chats/save")
async def save_chat(req: ChatSaveRequest):
    chat_id = req.chat_id or str(uuid.uuid4())
    print(f"Saving chat {chat_id}")
    with get_db() as conn:
        conn.execute("INSERT OR REPLACE INTO chats (id, title, mode, system_prompt, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)", (chat_id, req.title or "New Chat", req.mode, req.system_prompt))
        conn.execute("DELETE FROM messages WHERE chat_id = ?", (chat_id,))
        for msg in req.messages:
            meta = msg.get('metadata')
            if isinstance(meta, dict): meta = json.dumps(meta)
            conn.execute("INSERT INTO messages (chat_id, role, content, model, round, metadata) VALUES (?, ?, ?, ?, ?, ?)", (chat_id, msg['role'], msg.get('content',''), msg.get('model'), msg.get('round'), meta))
        conn.commit()
    return {"chat_id": chat_id}

@app.get("/chats")
def list_chats(): 
    with get_db() as conn: return {"chats": [dict(r) for r in conn.execute("SELECT * FROM chats ORDER BY updated_at DESC").fetchall()]}

@app.get("/chats/{chat_id}")
def get_chat(chat_id: str):
    with get_db() as conn:
        chat = conn.execute("SELECT * FROM chats WHERE id=?", (chat_id,)).fetchone()
        if not chat: raise HTTPException(404, "Not found")
        msgs = []
        for r in conn.execute("SELECT * FROM messages WHERE chat_id=?", (chat_id,)).fetchall():
            m = dict(r)
            if m['metadata']: 
                try: m.update(json.loads(m['metadata']))
                except: pass
            msgs.append(m)
        return {**dict(chat), "messages": msgs}

@app.get("/chats/{chat_id}/export/pdf")
async def export_pdf(chat_id: str):
    if not PDF_EXPORT_SUPPORT: raise HTTPException(500, "PDF unavailable")
    with get_db() as conn:
        chat = conn.execute("SELECT title FROM chats WHERE id=?", (chat_id,)).fetchone()
        msgs = conn.execute("SELECT * FROM messages WHERE chat_id=?", (chat_id,)).fetchall()
    
    doc = SimpleDocTemplate(f"/tmp/chat_{chat_id}.pdf", pagesize=A4, rightMargin=72, leftMargin=72, topMargin=72, bottomMargin=72)
    story = [Paragraph(chat['title'], getSampleStyleSheet()['Title']), Spacer(1, 12)]
    
    for m in msgs:
        text = m['content'] or ""
        if m['metadata']:
            try:
                meta = json.loads(m['metadata'])
                better = meta.get("full_json", {}).get("better_solution")
                if better and "CONVERGED" not in better:
                    text += "\n\n--- IMPROVED SOLUTION ---\n" + better
            except: pass
            
        clean = text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('\n', '<br/>')
        story.append(Paragraph(f"<b>{m['model'] or m['role']}:</b><br/>{clean[:5000]}", getSampleStyleSheet()['Normal']))
        story.append(Spacer(1, 12))
    
    doc.build(story)
    return FileResponse(f"/tmp/chat_{chat_id}.pdf", filename="chat.pdf")

@app.delete("/chats/{chat_id}")
def delete_chat(chat_id: str):
    with get_db() as conn: conn.execute("DELETE FROM chats WHERE id=?", (chat_id,)); conn.commit()
    return {"ok": True}

@app.get("/models")
def get_models(): return {"models": [{"id": k, **v} for k, v in MODELS.items()]}

@app.post("/upload/pdf")
def upload_pdf(file: UploadFile = File(...)): return {"filename": file.filename, "text": "PDF Content"} 
@app.post("/upload/image")
def upload_img(file: UploadFile = File(...)): return {"filename": file.filename}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)