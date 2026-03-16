# Yuujin-Server 实施进度报告

## 总体状态：v3.1 迁移完成

服务端基于 **Egg.js + TEGG + MySQL + Leoric** 架构，已完成 v3.1 PRD 的新业务迁移：角色卡系统、好友关系、新闻系统数据层，同时更新了数据库 schema 和现有模块。

---

## v3.1 迁移内容

### Step 1: 数据库迁移
- `database/init.sql` — 重写为 v3.1 完整 7 表 schema（全新安装）
- `database/migration-v3.sql` — 增量迁移脚本（从 v2 升级）
  - DROP `grammar_exposure`, `expressions`
  - ALTER `users`（删旧字段，加 avatar_url, jp_level, membership, settings）
  - ALTER `conversations`（删旧字段，加 character_id, last_message, last_message_at, has_unread）
  - ALTER `messages`（删 token_count，改 role 为 VARCHAR，加 language, metadata）
  - CREATE `characters`, `friendships`, `news`, `news_reads`

### Step 2+3: Leoric 模型
- **更新** `User.ts`（删 nativeLanguage/targetLanguage/level，加 avatarUrl/jpLevel/membership/settings）
- **更新** `Conversation.ts`（删 title/scenario/language/messageCount/updatedAt，加 characterId/lastMessage/lastMessageAt/hasUnread）
- **更新** `Message.ts`（删 tokenCount，加 language/metadata）
- **新建** `Character.ts`, `Friendship.ts`, `News.ts`, `NewsRead.ts`
- **删除** `GrammarExposure.ts`, `Expression.ts`

### Step 4: Character 模块
- `CharacterController` — GET/POST/PUT/DELETE /characters, POST /characters/generate (stub)
- `CharacterService` — list/create/getById/update/delete/seedPresets
- 3 个预设角色：佐藤ゆき、田中健太、山本さくら

### Step 5: Friend 模块
- `FriendController` — GET/POST/DELETE/PUT /friends
- `FriendService` — list/add/remove/update
- 首条消息逻辑：添加好友 → 创建 friendship + conversation + 角色自我介绍消息

### Step 6: Conversation 模块更新
- 删除 `findOrCreate`（好友模块统一创建对话）
- `saveMessage` → 同步更新 last_message / last_message_at / has_unread
- `list` → 按 is_pinned DESC, last_message_at DESC 排序
- 新增 `markAsRead` / `search`
- `ChatController` → body 改为 `{ conversationId, message, newsRef?, topicRef? }`，conversationId 必填

### Step 7: User 模块更新
- `GET /users/me` 返回新字段（avatarUrl, jpLevel, membership, settings）
- 新增 `PUT /users/me`（更新 name, avatarUrl, jpLevel, settings）

### Step 8: 清理
- 删除 `app/module/review/` 整个目录
- 删除旧模型文件
- 更新 `config/module.json` 移除 review，添加 character + friend

### Step 9: Seed + Docker
- `scripts/seed.ts` — 幂等插入 3 个预设角色
- `docker-compose.yml` — MySQL 8.0 + Redis 7 Alpine
- `package.json` 添加 `seed` 脚本

### Step 10: 配置收尾
- `config/config.default.ts` — bizConfig 添加 redis 配置
- `.env.example` — 添加 REDIS_HOST/PORT/PASSWORD/DB
- README.md — 更新 API 文档和项目结构
- PROGRESS.md — 更新本文件

---

## v3.1 数据库 Schema（7 张表）

| 表名 | 说明 |
|------|------|
| users | 用户（UUID 主键、email、密码、头像、JLPT 等级、会员、设置） |
| characters | 角色（预设 + 自建、人设、prompt_key） |
| conversations | 对话（关联用户 + 角色、最后消息、未读标记） |
| messages | 消息（角色、内容、语言检测、元数据） |
| friendships | 好友关系（置顶、免打扰） |
| news | 新闻（标题、内容、难度、标注） |
| news_reads | 新闻阅读记录 |

---

## API 端点总览

| Method | Path | Auth | 说明 |
|--------|------|------|------|
| POST | /auth/register | - | 注册 |
| POST | /auth/login | - | 登录 |
| POST | /auth/refresh | - | 刷新 token |
| GET | /characters | ✅ | 角色列表 |
| POST | /characters | ✅ | 创建角色 |
| POST | /characters/generate | ✅ | AI 生成角色 (stub) |
| GET | /characters/:id | ✅ | 角色详情 |
| PUT | /characters/:id | ✅ | 编辑角色 |
| DELETE | /characters/:id | ✅ | 删除角色 |
| GET | /friends | ✅ | 好友列表 |
| POST | /friends | ✅ | 添加好友 |
| DELETE | /friends/:characterId | ✅ | 删除好友 |
| PUT | /friends/:characterId | ✅ | 置顶/免打扰 |
| POST | /chat | ✅ | SSE 流式聊天 |
| GET | /conversations/ | ✅ | 对话列表 |
| GET | /conversations/:id | ✅ | 对话详情 + 消息 |
| DELETE | /conversations/:id | ✅ | 删除对话 |
| POST | /conversations/:id/read | ✅ | 标记已读 |
| GET | /conversations/:id/search | ✅ | 搜索消息 |
| GET | /users/me | ✅ | 用户资料 |
| PUT | /users/me | ✅ | 更新用户 |

---

## 踩坑记录

### 1. TEGG 需要 teggConfig 插件
`@eggjs/tegg-plugin` 依赖 `teggConfig`，必须额外安装 `@eggjs/tegg-config` 并在 `plugin.ts` 中启用。

### 2. TEGG 服务不能直接注入 EggContext
控制器中用 `@Context() ctx: EggContext` 获取上下文，cast 为 `Context`（egg），再传给服务方法。

### 3. TypeScript 类字段遮蔽 Leoric Bone getter
使用 `bone.getRaw()` 获取原始数据对象。

### 4. EggContext vs Context 类型不兼容
需要 `as unknown as EggCtx` 桥接。

---

## 前端进度同步（2026-03-14）

前端已完成 Phase 1 全部功能 + 动画打磨，当前使用 Mock 模式运行。前后端对接层已就绪（`services/real/*`），切换 `USE_REAL_API = true` 即可连接服务端。

---

## 2026-03-16 生产部署完成

### 阿里云 ECS 部署 ✅
| 项目 | 详情 |
|------|------|
| ECS | 阿里云杭州，`8.136.209.228` |
| ACR | `crpi-af4waxurlq3ud70j.cn-hangzhou.personal.cr.aliyuncs.com/takikawayuu/yuujin` |
| 域名 | `yuujin.cc`（待备案） |
| CI/CD | GitHub Actions → 构建镜像 → 推 ACR → SSH 部署 ECS |
| Docker 镜像 | Node 20 Alpine，多阶段构建 |
| 数据库 | MySQL 8.0 自建 Docker，端口仅绑 127.0.0.1 |
| 缓存 | Redis 7 Alpine 自建 Docker |
| 反代 | nginx，SSE `proxy_buffering off` |

### 部署文件
| 文件 | 说明 |
|------|------|
| `Dockerfile` | 多阶段构建 + 编译后 JS overlay 回源目录 |
| `docker-compose.prod.yml` | app + mysql + redis + nginx |
| `.github/workflows/deploy.yml` | push main 自动部署 |
| `nginx/default.conf` | 反代 + SSE 流式支持 |
| `scripts/init-server.sh` | ECS 首次初始化脚本 |

### 已验证 API
- [x] `POST /auth/login` — 登录成功，返回 JWT
- [x] `GET /characters` — 返回 3 个预设角色
- [x] nginx 80 端口反代正常

### 踩坑记录（部署相关）
1. **egg-scripts 在 devDependencies** — 生产启动命令 `npm start` 调用 `egg-scripts`，必须安装 devDeps
2. **编译后 JS 必须在源目录** — Egg.js 生产模式从 `config/` 和 `app/` 找 `.js` 文件，不从 `dist/` 找。Dockerfile 需 overlay
3. **prompts/ 未被 tsc 编译** — tsconfig.json 的 include 缺少 `prompts/**/*.ts`，导致 `Cannot find module`
4. **Docker Hub 国内不可用** — ECS 需配 `/etc/docker/daemon.json` 镜像加速
5. **ACR 个人版入口隐蔽** — 阿里云容器镜像服务首页只推企业版，需找个人版入口
6. **heredoc 空格敏感** — `.env` 写入时 EOF 前不能有空格，否则不结束

---

## 2026-03-16 功能更新

### Credit / AI 模型系统 ✅
| 文件 | 说明 |
|------|------|
| `app/module/credit/CreditService.ts` | `validateChatCredits` 增加 `settings.defaultModelId` 读取，三级优先：API param → defaultModelId → 回退最佳可用模型 |
| `app/module/auth/AuthService.ts` | 新注册用户默认 `settings: { defaultModelId: 'model-ernie-speed' }` |
| `app/module/user/UserController.ts` | `PUT /users/me` settings 更新改为浅合并 `{ ...existing, ...new }`，防止覆盖其他字段 |

### PWA 前端部署 ✅
nginx 配置更新：`/` 路径提供 PWA 静态文件（`/opt/yuujin/web/`），`/api/*` 反代到 app:7001。

**架构：**
```
nginx:80
├── /           → PWA 静态文件 (/opt/yuujin/web/)
├── /api/*      → proxy_pass app:7001
└── /api/chat   → SSE (proxy_buffering off)
```

---

## 2026-03-16 HTTPS + API 域名配置 ✅

### api.yuujin.cc HTTPS 反代
| 项目 | 详情 |
|------|------|
| 域名 | `api.yuujin.cc` → `8.136.209.228` |
| SSL 证书 | ZeroSSL（ACME 兼容），RSA 4096，有效期至 2026-06-14 |
| 证书工具 | `acme.sh` + 阿里云 DNS API（DNS-01 验证，绕过 ICP 拦截） |
| 自动续签 | `acme.sh` cron job，续签后自动 `docker restart yuujin-nginx` |
| 证书路径 | `/opt/yuujin/nginx/ssl/api.yuujin.cc.{fullchain.pem,key}` |

### Nginx 架构更新
```
浏览器 → api.yuujin.cc:443 (HTTPS)
           ├─ /            → app:7001 (Egg.js API)
           └─ /chat        → app:7001 (SSE 流式，proxy_buffering off)

浏览器 → 8.136.209.228:80
           ├─ /            → /opt/yuujin/web/ (PWA)
           ├─ /api/*       → app:7001 (兼容旧路由)
           └─ /api/chat    → app:7001 (SSE)
```

### Docker Compose 新增服务
- `certbot` — 自动续签容器（每 12h 检查）
- `certbot_conf` / `certbot_www` — 共享卷
- nginx `command` — 每 6h 自动 reload 加载新证书

### 文件变更
| 文件 | 说明 |
|------|------|
| `nginx/default.conf` | 双 server block：api.yuujin.cc HTTPS + 前端 PWA HTTP |
| `docker-compose.prod.yml` | 新增 certbot 服务 + ssl 卷挂载 |
| `nginx/init-letsencrypt.sh` | 首次证书申请脚本（实际用 acme.sh 替代） |

### 踩坑记录
1. **ICP 备案拦截** — 阿里云对未备案域名拦截 HTTP 请求返回 403，Let's Encrypt HTTP-01 验证失败。改用 DNS-01 验证绕过
2. **acme.sh 默认 CA** — 默认用 ZeroSSL 而非 Let's Encrypt，功能等价
3. **RAM 子账号权限** — 阿里云 AccessKey 需授予 `AliyunDNSFullAccess` 策略才能操作 DNS API
4. **Docker certbot entrypoint** — `docker compose run` 不会覆盖 compose 文件中的 `entrypoint`，需用 `--entrypoint ''` 显式覆盖

---

## 下一步计划

### 优先
1. ~~**前端切换真实模式**~~ ✅ — `USE_REAL_API = true`，API 地址已切换为 `https://api.yuujin.cc`
2. **端到端冒烟测试** — 注册 → Onboarding → 添加好友 → SSE 流式聊天
3. **配置 AI API 密钥** — 在 ECS `.env` 中填入 ERNIE/DeepSeek 密钥
4. ~~**域名 HTTPS**~~ ✅ — `api.yuujin.cc` HTTPS 已配置，ICP 备案仍待完成

### 功能补完
5. **话题抽卡** — POST /topics/draw 随机话题
6. **新闻评论系统** — 用户评论 + AI 角色朋友评论（用户间不互见）
7. **角色 Prompt 系统** — 根据 prompt_key 加载角色专属 prompt
8. **AI 角色生成** — 实现 POST /characters/generate

### 后续迭代
9. **会员系统** — 套餐 CRUD、用户会员记录、权益校验
10. **新闻抓取自动化** — 定时抓取 + AI 注释（假名/翻译/解说）

### 基础设施
11. **完善错误处理** — 统一错误码、HTTP 状态码规范化
12. **单元测试** — 各模块核心业务逻辑测试

### 新增数据表（待创建）
- `news_comments` — 新闻评论（支持用户评论 + AI 角色评论）
- `membership_plans` — 会员套餐
- `user_memberships` — 用户会员记录
