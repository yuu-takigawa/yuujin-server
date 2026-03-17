-- Migration: Add SOUL + MEMORY to friendships (per user-character pair)
-- Run once on production: mysql -u yuujin -p yuujin < migration-soul.sql

ALTER TABLE friendships
  ADD COLUMN soul           TEXT         DEFAULT NULL COMMENT '角色对本用户的灵魂状态（AI生成，随对话演化）',
  ADD COLUMN memory         TEXT         DEFAULT NULL COMMENT '角色对本用户的记忆（AI生成，随对话演化）',
  ADD COLUMN last_growth_at DATETIME     DEFAULT NULL COMMENT '上次 GrowthEngine 运行时间';
