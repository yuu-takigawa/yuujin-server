-- Migration: 新闻评论 + 通知系统
-- Run: mysql -u yuujin -pYuujin_Mysql_2026 yuujin < migration-comments.sql

CREATE TABLE IF NOT EXISTS news_comments (
  id           VARCHAR(36)  PRIMARY KEY,
  news_id      VARCHAR(36)  NOT NULL,
  user_id      VARCHAR(36)  DEFAULT NULL,       -- NULL if AI character comment
  character_id VARCHAR(36)  DEFAULT NULL,       -- NULL if human comment
  parent_id    VARCHAR(36)  DEFAULT NULL,       -- NULL = top-level; else reply
  content      TEXT         NOT NULL,
  mentions     JSON         DEFAULT NULL,       -- [{ type:'character'|'user', id, name }]
  is_ai        TINYINT(1)   DEFAULT 0,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_news_id  (news_id),
  INDEX idx_user_id  (user_id),
  INDEX idx_parent_id (parent_id),
  FOREIGN KEY (news_id) REFERENCES news(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id                  VARCHAR(36)  PRIMARY KEY,
  user_id             VARCHAR(36)  NOT NULL,    -- 接收者
  type                VARCHAR(50)  NOT NULL,    -- 'comment'|'mention'|'ai_comment'|'reply'
  entity_type         VARCHAR(50)  DEFAULT NULL, -- 'news_comment'
  entity_id           VARCHAR(36)  DEFAULT NULL,
  from_user_id        VARCHAR(36)  DEFAULT NULL,
  from_character_id   VARCHAR(36)  DEFAULT NULL,
  is_read             TINYINT(1)   DEFAULT 0,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_unread (user_id, is_read),
  INDEX idx_user_created (user_id, created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
