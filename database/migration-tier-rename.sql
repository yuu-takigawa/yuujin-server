-- Yuujin 会員ティア名変更: basic→pro, premium→max + モデル整理
-- Execute: docker exec -i yuujin-mysql mysql -uyuujin -pyuujin123 yuujin < database/migration-tier-rename.sql

-- ===== 1. membership_plans: rename tiers =====
UPDATE membership_plans SET tier = 'pro', name = 'Pro' WHERE tier = 'basic';
UPDATE membership_plans SET tier = 'max', name = 'Max', price_monthly = 29.90, daily_credits = 2000, description = '毎日2000ポイント、全モデル利用可能' WHERE tier = 'premium';

-- ===== 2. users: rename membership tier values =====
UPDATE users SET membership = 'pro' WHERE membership = 'basic';
UPDATE users SET membership = 'max' WHERE membership = 'premium';

-- ===== 3. ai_models: update tiers + deactivate + reorder =====
-- display_order ASC: small = top (Max first, then Pro, then Free)

-- Deactivate all Claude models (no API key configured)
UPDATE ai_models SET is_active = 0 WHERE id IN ('model-claude-haiku', 'model-claude-sonnet', 'model-claude-opus');

-- Max tier (top)
UPDATE ai_models SET min_tier = 'max', display_order = 10 WHERE id = 'model-qwen-max';
UPDATE ai_models SET min_tier = 'max', display_order = 11 WHERE id = 'model-qwen-plus-char-ja';

-- Pro tier (middle)
UPDATE ai_models SET min_tier = 'pro', display_order = 20 WHERE id = 'model-qwen-flash-char';
UPDATE ai_models SET min_tier = 'pro', display_order = 21 WHERE id = 'model-deepseek-v3';
UPDATE ai_models SET min_tier = 'pro', display_order = 22 WHERE id = 'model-qwen-plus-char';
UPDATE ai_models SET min_tier = 'pro', display_order = 23 WHERE id = 'model-qwen-plus';

-- Free tier (bottom)
UPDATE ai_models SET min_tier = 'free', display_order = 30 WHERE id = 'model-ernie-speed';
UPDATE ai_models SET min_tier = 'free', display_order = 31 WHERE id = 'model-ernie-lite';
