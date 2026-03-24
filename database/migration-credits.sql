-- Yuujin 会員・積分システム Migration
-- Execute: docker exec -i yuujin-mysql mysql -uyuujin -pyuujin123 yuujin < database/migration-credits.sql

-- ALTER users: add credits columns
ALTER TABLE users
  ADD COLUMN credits INT DEFAULT 100 AFTER membership,
  ADD COLUMN credits_reset_at DATETIME DEFAULT CURRENT_TIMESTAMP AFTER credits;

-- Drop old membership_plans if exists (replacing with new schema)
DROP TABLE IF EXISTS user_memberships;
DROP TABLE IF EXISTS membership_plans;

-- CREATE membership_plans (new schema with tier + daily_credits)
CREATE TABLE IF NOT EXISTS membership_plans (
  id VARCHAR(36) PRIMARY KEY,
  tier VARCHAR(20) NOT NULL,
  name VARCHAR(100) NOT NULL,
  price_monthly DECIMAL(10,2) NOT NULL DEFAULT 0,
  daily_credits INT NOT NULL,
  description TEXT,
  is_active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- CREATE ai_models
CREATE TABLE IF NOT EXISTS ai_models (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  provider VARCHAR(50) NOT NULL,
  model_id VARCHAR(100) NOT NULL,
  credits_per_chat INT NOT NULL,
  min_tier VARCHAR(20) NOT NULL,
  display_order INT DEFAULT 0,
  is_active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- CREATE credit_logs
CREATE TABLE IF NOT EXISTS credit_logs (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  amount INT NOT NULL,
  type VARCHAR(30) NOT NULL,
  description VARCHAR(200),
  model_id VARCHAR(36),
  balance_after INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_created (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed membership plans
INSERT INTO membership_plans (id, tier, name, price_monthly, daily_credits, description) VALUES
  ('plan-free', 'free', '無料プラン', 0, 100, '毎日100ポイント、基本モデル利用可能'),
  ('plan-basic', 'basic', 'ベーシック', 9.90, 500, '毎日500ポイント、DeepSeek・通義千問利用可能'),
  ('plan-premium', 'premium', 'プレミアム', 29.90, 2000, '毎日2000ポイント、全モデル利用可能');

-- Seed AI models
INSERT INTO ai_models (id, name, provider, model_id, credits_per_chat, min_tier, display_order) VALUES
  ('model-ernie-speed', 'ERNIE Speed', 'ernie', 'ernie-speed', 1, 'free', 1),
  ('model-ernie-lite', 'ERNIE Lite', 'ernie', 'ernie-lite', 1, 'free', 2),
  ('model-deepseek-v3', 'DeepSeek V3', 'deepseek', 'deepseek-chat', 5, 'basic', 3),
  ('model-qwen-plus', 'Qwen Plus', 'qianwen', 'qwen-plus', 5, 'basic', 4),
  ('model-qwen-max', 'Qwen Max', 'qianwen', 'qwen-max', 10, 'basic', 5),
  ('model-claude-haiku', 'Claude Haiku 4.5', 'claude', 'claude-haiku-4-5-20251001', 15, 'premium', 6),
  ('model-claude-sonnet', 'Claude Sonnet 4.6', 'claude', 'claude-sonnet-4-6', 30, 'admin', 7),
  ('model-claude-opus', 'Claude Opus 4.6', 'claude', 'claude-opus-4-6', 50, 'admin', 8);
