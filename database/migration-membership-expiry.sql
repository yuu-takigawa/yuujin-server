-- 会员到期机制：User 加 membership_expires_at + 插入 helloyuujin 活动码

ALTER TABLE users ADD COLUMN membership_expires_at DATETIME DEFAULT NULL COMMENT '会员到期时间，NULL=永久';

INSERT INTO redeem_codes (id, code, reward, max_uses, used_count, expires_at, is_active, description, created_at, updated_at)
VALUES (
  UUID(),
  'HELLOYUUJIN',
  '{"membership_days":30,"membership_tier":"pro"}',
  500,
  0,
  NULL,
  1,
  '活動キャンペーン：30日間Proメンバーシップ体験',
  NOW(),
  NOW()
);
