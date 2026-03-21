-- 邮箱验证码 + 手机号预留
-- Execute: docker exec -i yuujin-mysql mysql -uyuujin -p"$MYSQL_PW" yuujin < database/migration-verification.sql

-- 1. verification_codes 表
CREATE TABLE IF NOT EXISTS verification_codes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  code VARCHAR(6) NOT NULL,
  type ENUM('register', 'reset_password') NOT NULL,
  expires_at DATETIME NOT NULL,
  used TINYINT(1) NOT NULL DEFAULT 0,
  attempts INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_email_type (email, type),
  INDEX idx_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. users 表加 phone 列（Phase 2 预留）
ALTER TABLE users ADD COLUMN phone VARCHAR(20) DEFAULT NULL AFTER email;
ALTER TABLE users ADD UNIQUE INDEX idx_phone (phone);
