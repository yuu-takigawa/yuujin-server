-- Migration: 推送通知设备令牌
-- Run: docker exec -i yuujin-mysql mysql -uyuujin -pYuujin_Mysql_2026 yuujin < database/migration-push.sql

CREATE TABLE IF NOT EXISTS device_tokens (
  id          VARCHAR(36)   PRIMARY KEY,
  user_id     VARCHAR(36)   NOT NULL,
  token       VARCHAR(500)  NOT NULL,
  platform    VARCHAR(20)   NOT NULL DEFAULT 'expo', -- 'expo'|'fcm'|'apns'
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_token (user_id, token),
  INDEX idx_user_id (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
