-- Migration: Soul System Refactor
-- 1. characters 表加 initial_soul 字段（角色初始 SOUL，加好友时 copy 到 friendship.soul）
-- 2. 去掉 prompt_key（不再用静态文件，soul 直接存库）

ALTER TABLE characters
  ADD COLUMN initial_soul TEXT AFTER bio;

ALTER TABLE characters
  DROP COLUMN prompt_key;
