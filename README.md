<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="License">
  <img src="https://img.shields.io/badge/lang-TypeScript-3178c6" alt="TypeScript">
</p>

<h1 align="center">友人 Yuujin Server</h1>

<p align="center">
  <strong>Backend service for Yuujin — your AI Japanese friend.</strong><br>
  No grammar drills. No flashcards. Just real conversations.
</p>

---

## What is Yuujin?

Yuujin (友人, "friend" in Japanese) is an AI-powered Japanese conversation partner that helps you learn Japanese the way native speakers do — through natural, immersive dialogue.

Unlike traditional language apps, Yuujin doesn't teach grammar rules. Instead, it creates a Japanese environment where you chat with an AI friend who adapts to your level. When you're curious about why something is said a certain way, just ask in Chinese — your friend explains with intuition and context, not textbook definitions.

## Features

- **Natural Conversation** — Chat with an AI friend who has personality, memory, and context awareness
- **Adaptive Difficulty** — AI automatically adjusts language complexity based on your level
- **Seamless Code-Switching** — Ask "why?" in Chinese anytime, get intuitive explanations, then flow back into Japanese
- **Grammar Tracking** — Behind the scenes, the system tracks which grammar patterns you've encountered and naturally used
- **Conversation Review** — After each chat, see what new expressions you picked up and your progress over time
- **Recast, Not Correct** — Instead of interrupting to fix mistakes, the AI naturally rephrases using correct expressions (just like a real friend would)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js (>= 18) |
| Language | TypeScript |
| Framework | Express / Hono |
| Database | PostgreSQL (Supabase) |
| ORM | Drizzle ORM |
| AI | Claude API (Anthropic) |
| Cache | Redis (Upstash) |
| Deployment | Docker / Vercel |

## Project Structure

```
yuujin-server/
├── src/
│   ├── routes/              # API route handlers
│   │   ├── chat.ts          # Core conversation endpoint (streaming)
│   │   ├── review.ts        # Post-conversation review
│   │   ├── conversations.ts # Conversation CRUD
│   │   └── users.ts         # User management
│   ├── services/
│   │   ├── ai.ts            # AI client wrapper
│   │   ├── conversation.ts  # Conversation logic
│   │   ├── grammar.ts       # Grammar tracking engine
│   │   └── review.ts        # Review generation
│   ├── lib/
│   │   ├── prompt-loader.ts # Load system prompts (supports external config)
│   │   ├── language.ts      # Language detection (ja/zh/mixed)
│   │   └── level.ts         # Japanese level estimation
│   ├── db/
│   │   ├── schema.ts        # Drizzle schema definitions
│   │   └── index.ts         # Database connection
│   ├── types/
│   │   └── index.ts         # Shared type definitions
│   └── index.ts             # App entry point
├── prompts/
│   └── default.example.ts   # Example system prompt (basic version)
├── drizzle/                  # Database migrations
├── .env.example
├── Dockerfile
├── package.json
└── tsconfig.json
```

## Getting Started

### Prerequisites

- Node.js >= 18
- PostgreSQL database (or [Supabase](https://supabase.com) account)
- Anthropic API key ([get one here](https://console.anthropic.com))

### Setup

```bash
# Clone the repo
git clone https://github.com/yuu-takigawa/yuujin-server.git
cd yuujin-server

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your database URL and API keys

# Run database migrations
npm run db:migrate

# Start development server
npm run dev
```

### Environment Variables

```env
# Database
DATABASE_URL=postgresql://...

# AI
ANTHROPIC_API_KEY=sk-ant-...

# Optional: Custom prompt path (default uses prompts/default.example.ts)
PROMPT_PATH=

# Optional: Redis for caching
REDIS_URL=
```

## API Overview

### `POST /api/chat`
Send a message and receive a streaming AI response.

```json
{
  "conversationId": "uuid",
  "message": "今日は何してたの？"
}
```
Response: Server-Sent Events (streaming)

### `POST /api/conversations`
Create a new conversation.

### `GET /api/conversations/:id/review`
Get post-conversation review with grammar insights.

### `GET /api/users/:id/progress`
Get user's grammar exposure and learning progress.

> Full API documentation → [docs/api.md](docs/api.md)

## Custom Prompts

Yuujin's personality and teaching behavior are driven by system prompts. The repo includes a basic example prompt that works out of the box.

To customize the AI friend's personality:

1. Copy `prompts/default.example.ts`
2. Modify the character settings, behavior rules, and teaching strategies
3. Set `PROMPT_PATH` in your `.env` to point to your custom prompt file

The hosted version of Yuujin uses fine-tuned prompts that are not included in this repo.

## Contributing

Contributions are welcome! Whether it's bug fixes, new features, or improvements to the grammar tracking engine.

1. Fork the repo
2. Create your branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT © [yuu-takigawa](https://github.com/yuu-takigawa)

---

<p align="center">
  <strong>友人</strong> — Learn Japanese the way it's meant to be learned.<br>
  Built with ❤️ by <a href="https://github.com/yuu-takigawa">Takigawa Yuu</a>
</p>
