-- topic_cards: 预生成话题卡
-- Execute: docker exec -i yuujin-mysql mysql -uyuujin -p"$MYSQL_PW" yuujin < database/migration-topic-cards.sql

CREATE TABLE IF NOT EXISTS topic_cards (
  id VARCHAR(36) PRIMARY KEY,
  character_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  text VARCHAR(100) NOT NULL,
  emoji VARCHAR(10) DEFAULT '💬',
  used TINYINT(1) DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_char_used (user_id, character_id, used),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
