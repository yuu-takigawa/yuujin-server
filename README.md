<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="License">
  <img src="https://img.shields.io/badge/lang-TypeScript-3178c6" alt="TypeScript">
</p>

<h1 align="center">友人 Yuujin Server</h1>

<p align="center">
  <strong>Backend service for Yuujin — your AI Japanese friend.</strong><br>
  No grammar drills. No flashcards. Just real conversations with AI characters.
</p>

---

## What is Yuujin?

Yuujin (友人, "friend" in Japanese) is an AI-powered Japanese conversation partner that helps you learn Japanese the way native speakers do — through natural, immersive dialogue with unique character personas.

Unlike traditional language apps, Yuujin doesn't teach grammar rules. Instead, it creates a Japanese environment where you chat with AI friends who adapt to your level. When you're curious about why something is said a certain way, just ask in Chinese — your friend explains with intuition and context, not textbook definitions.

## Features

- **Character System** — Chat with diverse AI characters, each with unique personalities, backgrounds, and speaking styles
- **Friend System** — Add characters as friends to start conversations, with automatic self-introduction
- **Natural Conversation** — AI friends have personality, memory, and context awareness
- **Adaptive Difficulty** — AI automatically adjusts language complexity based on your JLPT level
- **Seamless Code-Switching** — Ask "why?" in Chinese anytime, get intuitive explanations, then flow back into Japanese
- **News Reading** — Practice reading comprehension with annotated Japanese news articles
- **Recast, Not Correct** — Instead of interrupting to fix mistakes, the AI naturally rephrases using correct expressions

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js (>= 18) |
| Language | TypeScript |
| Framework | Egg.js + TEGG (IoC) |
| Database | MySQL 8.0 |
| Cache | Redis 7 |
| ORM | Leoric (via egg-orm) |
| AI | Claude API (Anthropic) |
| Streaming | SSE (Server-Sent Events) |
| Auth | JWT (jsonwebtoken + bcryptjs) |

## Project Structure

```
yuujin-server/
├── app/
│   ├── module/
│   │   ├── auth/             # JWT authentication
│   │   ├── ai/               # AI abstraction layer (Claude, Qianwen)
│   │   ├── conversation/     # Chat + SSE streaming
│   │   ├── character/        # Character CRUD + presets
│   │   ├── friend/           # Friend system + first message
│   │   └── user/             # User profile + settings
│   ├── model/                # Leoric ORM models (7 tables)
│   └── middleware/           # Auth + CORS middleware
├── config/                   # Egg.js + TEGG configuration
├── database/                 # SQL schema + migration
├── scripts/                  # Seed scripts
├── prompts/                  # System prompts
├── docker-compose.yml        # MySQL + Redis
├── .env.example
├── package.json
└── tsconfig.json
```

## Getting Started

### Prerequisites

- Node.js >= 18
- Docker & Docker Compose (recommended)
- Anthropic API key ([get one here](https://console.anthropic.com))

### Setup

```bash
# 1. Start MySQL + Redis via Docker Compose
docker-compose up -d

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env and set CLAUDE_API_KEY

# 4. Seed preset characters
npm run seed

# 5. Start development server
npm run dev
# Server runs at http://localhost:7001
```

### For existing databases (migration from v2)

```bash
docker exec -i yuujin-server-mysql-1 mysql -uyuujin -pyuujin123 yuujin < database/migration-v3.sql
npm run seed
```

## API Endpoints

### Auth
- `POST /auth/register` — Register new user
- `POST /auth/login` — Login
- `POST /auth/refresh` — Refresh token

### Characters
- `GET /characters` — List all characters (presets + user-created)
- `POST /characters` — Create custom character
- `POST /characters/generate` — AI-generate character (stub)
- `GET /characters/:id` — Get character details
- `PUT /characters/:id` — Update custom character
- `DELETE /characters/:id` — Delete custom character

### Friends
- `GET /friends` — List friends (with character info + last message)
- `POST /friends` — Add friend `{ characterId }` (creates conversation + first message)
- `DELETE /friends/:characterId` — Remove friend + conversation
- `PUT /friends/:characterId` — Pin/mute friend

### Chat
- `POST /chat` — Send message (SSE streaming response) `{ conversationId, message }`

### Conversations
- `GET /conversations/` — List conversations (pinned first, then by last message)
- `GET /conversations/:id` — Get conversation with messages
- `DELETE /conversations/:id` — Delete conversation
- `POST /conversations/:id/read` — Mark as read
- `GET /conversations/:id/search?keyword=` — Search messages

### User
- `GET /users/me` — Get current user profile
- `PUT /users/me` — Update profile (name, avatarUrl, jpLevel, settings)

## Smoke Test

```bash
# Register
curl -X POST http://localhost:7001/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"t@t.com","password":"123456","name":"T"}'

# List characters (should see 3 presets)
curl http://localhost:7001/characters \
  -H "Authorization: Bearer <token>"

# Add friend
curl -X POST http://localhost:7001/friends \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"characterId":"preset-sato-yuki"}'

# List conversations (should see first message)
curl http://localhost:7001/conversations/ \
  -H "Authorization: Bearer <token>"

# Chat (SSE)
curl -N -X POST http://localhost:7001/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"conversationId":"<id>","message":"こんにちは！"}'

# Update user
curl -X PUT http://localhost:7001/users/me \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"jpLevel":"N3"}'
```

## Database Schema (v3.1)

| Table | Description |
|-------|------------|
| users | User accounts with JLPT level and settings |
| characters | AI character personas (preset + custom) |
| conversations | User-character conversations |
| messages | Chat messages with language detection |
| friendships | User-character friend relationships |
| news | Japanese news articles with annotations |
| news_reads | User news read tracking |

## Contributing

Contributions are welcome! Whether it's bug fixes, new features, or improvements.

1. Fork the repo
2. Create your branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT

---

<p align="center">
  <strong>友人</strong> — Learn Japanese the way it's meant to be learned.
</p>
