-- Migration: 添加 Qianwen 角色扮演专精模型
-- 这些模型针对角色扮演场景优化，日语学习效果更好

-- 插入新模型（全部用 qianwen provider，同一 DashScope 端点）
INSERT IGNORE INTO ai_models (id, name, provider, model_id, credits_per_chat, min_tier, display_order) VALUES
  -- 免费/基础会员默认：速度快、便宜、角色扮演专精
  ('model-qwen-flash-char', 'Qwen Flash Char', 'qianwen', 'qwen-flash-character', 2, 'free', 0),
  -- 高级会员：角色还原更强
  ('model-qwen-plus-char',  'Qwen Plus Char',  'qianwen', 'qwen-plus-character',  8, 'basic', 3),
  -- 日语特化模型（admin / 自测用）
  ('model-qwen-plus-char-ja','Qwen Plus Char JA','qianwen','qwen-plus-character-ja',20,'admin', 4);

-- 把旧的 ERNIE Speed/Lite 降低排序（它们移到后面作为备选）
UPDATE ai_models SET display_order = 10 WHERE id = 'model-ernie-speed';
UPDATE ai_models SET display_order = 11 WHERE id = 'model-ernie-lite';
