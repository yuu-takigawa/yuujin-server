-- 对话归档摘要字段
-- 用于存储 GrowthEngine 生成的历史对话压缩摘要

ALTER TABLE friendships
  ADD COLUMN conversation_summary TEXT DEFAULT NULL AFTER memory;
