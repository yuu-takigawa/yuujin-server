-- TTS 音色字段：为角色绑定 Qwen3-TTS 音色
-- 预设角色根据性别分配默认音色

ALTER TABLE characters
  ADD COLUMN voice VARCHAR(50) DEFAULT '' COMMENT 'TTS 音色 ID (Qwen3-TTS)';

-- 为现有预设角色分配默认音色
UPDATE characters SET voice = 'Chelsie' WHERE id = 'preset-sato-yuki';      -- 22岁女性
UPDATE characters SET voice = 'Ethan'   WHERE id = 'preset-tanaka-kenta';    -- 28岁男性
UPDATE characters SET voice = 'Maia'    WHERE id = 'preset-yamamoto-sakura'; -- 35岁女性
UPDATE characters SET voice = 'Moon'    WHERE id = 'preset-nakamura-ren';    -- 31岁男性
UPDATE characters SET voice = 'Momo'    WHERE id = 'preset-suzuki-mio';      -- 20岁女性
