# LLM Discussion Hub

A flexible multi-LLM chat interface that supports both normal single-model conversations and **discussion mode** where multiple LLMs iteratively solve and critique each other's work until convergence.

## Features

- **Normal Mode**: Chat with a single LLM (GPT-4o, Gemini 1.5 Pro, or Claude Sonnet)
- **Discussion Mode**: Assign one LLM as the solver and another as the critic
  - Iterative refinement until the critic finds no more issues
  - Configurable max rounds
  - Swap roles easily between prompts
- Clean, dark-themed chat interface
- Real-time API status indicators
- Full conversation history

## Architecture

```
┌─────────────────┐     ┌─────────────────┐
│  React Frontend │────▶│  FastAPI Backend │
│    (Vite)       │◀────│                  │
└─────────────────┘     └────────┬─────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
              ┌─────────┐  ┌─────────┐  ┌─────────┐
              │ OpenAI  │  │ Google  │  │Anthropic│
              │   API   │  │   API   │  │   API   │
              └─────────┘  └─────────┘  └─────────┘
```

## Discussion Flow

```
Round 1:
  User Prompt → Solver (e.g., GPT) → Initial Solution
  Initial Solution → Critic (e.g., Gemini) → Critique

Round 2:
  Original Prompt + Previous Solution + Critique → Solver → Improved Solution
  Improved Solution → Critic → New Critique

Round N:
  Continue until:
    - Critic reports no issues (converged)
    - Max rounds reached
```

## Setup

### Prerequisites

- Python 3.10+
- Node.js 18+
- API keys for at least 2 of the following:
  - OpenAI (GPT)
  - Google (Gemini)
  - Anthropic (Claude)

### 1. Clone and Configure

```bash
cd llm-hub

# Backend setup
cd backend
cp .env.template .env
# Edit .env and add your API keys
```

### 2. Get API Keys

| Provider | Get Key At | Cost |
|----------|------------|------|
| OpenAI | https://platform.openai.com/api-keys | Pay-per-use |
| Google | https://makersuite.google.com/app/apikey | Free tier available |
| Anthropic | https://console.anthropic.com/ | Pay-per-use |

### 3. Install Dependencies

**Backend:**
```bash
cd backend
pip install -r requirements.txt
```

**Frontend:**
```bash
cd frontend
npm install
```

### 4. Run

**Terminal 1 - Backend:**
```bash
cd backend
python main.py
# or: uvicorn main:app --reload --port 8000
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

Open http://localhost:3000

## Usage

### Normal Mode
1. Select "Normal" mode
2. Choose your preferred model from the dropdown
3. Type your message and send

### Discussion Mode
1. Select "Discuss" mode
2. Choose which model should be the **Solver** (generates solutions)
3. Choose which model should be the **Critic** (reviews and critiques)
4. Set max rounds (default: 5)
5. Enter your task and send

The models will iterate until:
- The critic finds no significant issues (convergence)
- Max rounds are reached

Use the "⇄ Swap" button to quickly switch solver and critic roles between tasks.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Check which API keys are configured |
| `/chat/normal` | POST | Single-model chat |
| `/chat/discuss` | POST | Discussion mode with iterative refinement |

## Customization Ideas

- **Add more models**: Edit `MODELS` in `App.jsx` and add corresponding API calls in `main.py`
- **Change convergence criteria**: Modify `parse_critique()` and the convergence check in `discuss_chat()`
- **Add streaming**: Implement SSE for real-time token streaming
- **Persist conversations**: Add a database to save chat history
- **Add Claude as third opinion**: Extend discussion mode to support 3+ models

## Cost Estimation

Each discussion round makes 2 API calls (solver + critic). With 5 max rounds:
- Best case (convergence at round 1): 2 calls
- Worst case (no convergence): 10 calls

Approximate costs per discussion (varies by prompt length):
- GPT-4o: ~$0.01-0.05 per call
- Gemini 1.5 Pro: Free tier or ~$0.001-0.01 per call
- Claude Sonnet: ~$0.01-0.05 per call

## License

MIT - Do whatever you want with it.

## Credits

Inspired by Andrej Karpathy's [LLM Council](https://github.com/karpathy/llm-council) and your own workflow of cross-validating LLM outputs!
