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
- **Friend System** — Add characters as friends with SSE-streamed welcome messages
- **Natural Conversation** — AI friends have personality, evolving soul & memory, and context awareness
- **Adaptive Difficulty** — AI automatically adjusts language complexity based on your JLPT level (none → N1)
- **Seamless Code-Switching** — Ask "why?" in Chinese anytime, get intuitive explanations, then flow back into Japanese
- **Message Tools** — Inline translation, grammar analysis, and correction via SSE streaming
- **Suggest Reply** — AI suggests what you could say next (free)
- **News System** — Japanese news articles with paragraph-level AI annotations (translation & explanation)
- **News Comments** — Users can comment on articles; AI characters auto-reply
- **Topic Cards** — Pre-generated and on-demand conversation starters
- **Voice** — Text-to-Speech (with streaming) and Speech-to-Text
- **Membership & Credits** — Free / Pro / Max tiers with daily credit allowance
- **Push Notifications** — Expo Push integration
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
| AI | Claude, Qianwen, DeepSeek, ERNIE (pluggable) |
| Streaming | SSE (Server-Sent Events) |
| Auth | JWT + email verification codes |
| Storage | Alibaba Cloud OSS (avatars, images, TTS cache) |
| JP Tokenizer | kuromoji |
| Deployment | GitHub Actions → Docker → ECS |

## Project Structure

```
yuujin-server/
├── app/
│   ├── module/
│   │   ├── auth/             # JWT auth + email verification
│   │   ├── ai/               # AI abstraction (Claude, Qianwen, DeepSeek, ERNIE)
│   │   ├── conversation/     # Chat + SSE streaming + annotations
│   │   ├── character/        # Character CRUD + presets + bio generation
│   │   ├── friend/           # Friend system + greeting message
│   │   ├── user/             # User profile + settings + account deletion
│   │   ├── news/             # News articles + paragraph annotations
│   │   ├── comment/          # News comments + AI character replies
│   │   ├── notification/     # Notification system
│   │   ├── topic/            # Topic card generation
│   │   ├── voice/            # TTS + STT
│   │   ├── avatar/           # Avatar presets + upload (OSS)
│   │   ├── image/            # Chat image upload
│   │   ├── credit/           # Credits + membership
│   │   ├── subscription/     # Membership tier management
│   │   └── push/             # Expo push notifications
│   ├── model/                # Leoric ORM models (13+ tables)
│   └── middleware/           # Auth + CORS middleware
├── config/                   # Egg.js + TEGG configuration
├── database/                 # SQL schema + migrations
├── scripts/                  # Seed scripts
├── docker-compose.yml        # MySQL + Redis
├── .env.example
├── package.json
└── tsconfig.json
```

## Getting Started

### Prerequisites

- Node.js >= 18
- Docker & Docker Compose (recommended)
- At least one AI API key (Claude, Qianwen, DeepSeek, or ERNIE)

### Setup

```bash
# 1. Start MySQL + Redis via Docker Compose
docker-compose up -d

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env — set AI keys, OSS credentials, SMTP, etc.

# 4. Seed preset characters
npm run seed

# 5. Start development server
npm run dev
# Server runs at http://localhost:7001
```

## API Endpoints

### Auth
- `POST /auth/register` — Register (email + verification code, invite code required)
- `POST /auth/login` — Login
- `POST /auth/refresh` — Refresh token
- `POST /auth/send-code` — Send verification code (register / reset password)
- `POST /auth/verify-code` — Verify code
- `POST /auth/reset-password` — Reset password
- `POST /auth/change-password` — Change password (authenticated)

### Characters
- `GET /characters` — List all characters (presets + user-created)
- `POST /characters` — Create custom character
- `GET /characters/:id` — Get character details
- `PUT /characters/:id` — Update custom character
- `DELETE /characters/:id` — Delete custom character
- `POST /characters/generate-bio` — AI-generate character bio (SSE)

### Friends
- `GET /friends` — List friends (with character info + last message)
- `POST /friends` — Add friend `{ characterId }` (creates conversation + first message)
- `DELETE /friends/:characterId` — Remove friend + conversation
- `PUT /friends/:characterId` — Pin/mute friend `{ isPinned?, isMuted? }`

### Chat
- `POST /chat` — Send message (SSE streaming) `{ conversationId, message, imageUrl? }`
- `POST /chat/greet` — New friend greeting message (SSE streaming)
- `POST /chat/suggest` — AI reply suggestion (SSE, free)
- `POST /chat/annotate` — Message annotation (SSE) `{ content, type: 'translation'|'analysis'|'correction' }`
- `POST /chat/image` — Upload chat image (multipart, 10MB limit)

### Conversations
- `GET /conversations/` — List conversations (pinned first, by last message)
- `GET /conversations/:id` — Get conversation with messages `?limit=30&before=<messageId>`
- `DELETE /conversations/:id` — Delete conversation
- `POST /conversations/:id/read` — Mark as read
- `DELETE /conversations/:id/messages` — Clear all messages
- `GET /conversations/:id/search?keyword=` — Search messages

### User
- `GET /users/me` — Get current user profile
- `PUT /users/me` — Update profile (name, avatarUrl, jpLevel, settings)
- `DELETE /users/me` — Delete account (cascades all data)

### News
- `GET /news` — List published articles `?offset=0&limit=10`
- `GET /news/:id` — Article detail
- `POST /news/:id/read` — Mark as read
- `POST /news/:id/annotate` — Paragraph annotation (SSE, cached) `{ paragraphIndex, type }`

### Comments
- `GET /news/:id/comments` — List comments
- `POST /news/:id/comments` — Post comment `{ content, parentId? }`
- `POST /news/:id/comments/ai-reply` — AI character reply (SSE) `{ commentId, characterId }`
- `DELETE /news/:newsId/comments/:commentId` — Delete own comment

### Topics
- `POST /topics/draw` — Draw pre-generated topic card (free) `{ characterId }`
- `POST /topics/shuffle` — AI-generate new topic (costs credits) `{ characterId }`

### Voice
- `POST /voice/tts` — Text-to-Speech `{ text, voice? }` → `{ url, cached }`
- `POST /voice/tts-stream` — Streaming TTS (SSE) `{ text, voice? }`
- `POST /voice/transcribe` — Speech-to-Text (multipart)

### Avatars
- `GET /avatars/presets` — List preset avatars (15 irasutoya illustrations)
- `POST /avatars/upload` — Upload custom avatar (multipart, content moderation)
- `PUT /avatars/character/:id` — Set character avatar

### Credits & Membership
- `GET /credits` — Current credit info
- `GET /models` — Available AI models (with credit cost & tier requirements)
- `POST /subscriptions/upgrade` — Upgrade membership `{ tier: 'pro'|'max' }`

### Notifications
- `GET /notifications` — Unread notifications
- `GET /notifications/unread-count` — Unread count
- `POST /notifications/read-all` — Mark all as read

### Push
- `POST /push/register` — Register device token (Expo Push) `{ token, platform? }`
- `DELETE /push/unregister` — Unregister device token `{ token }`

## Database Schema (v4)

| Table | Description |
|-------|------------|
| users | User accounts with JLPT level, membership tier, and credits |
| characters | AI character personas (preset + custom) with initial_soul |
| friendships | User-character relationships with evolving soul & memory |
| conversations | User-character conversations |
| messages | Chat messages with language detection and metadata |
| news | Japanese news articles with annotations |
| news_reads | User news read tracking |
| news_comments | News article comments (user + AI character) |
| notifications | Notification system |
| membership_plans | Membership tiers (free / pro / max) |
| ai_models | AI model configurations with credit costs |
| credit_logs | Credit transaction history |
| device_tokens | Push notification device tokens |
| topic_cards | Pre-generated conversation topic cards |
| verification_codes | Email verification codes |

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
