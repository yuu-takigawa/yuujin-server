import { EggAppConfig, PowerPartial } from 'egg';
import * as dotenv from 'dotenv';

dotenv.config();

export default () => {
  const config = {} as PowerPartial<EggAppConfig>;

  config.keys = process.env.EGG_KEYS || 'yuujin-server-default-cookie-keys';

  // Disable CSRF for API server
  config.security = {
    csrf: {
      enable: false,
    },
  };

  // MySQL via egg-orm (Leoric)
  // egg-orm auto-discovers models from app/model/ by convention
  config.orm = {
    client: 'mysql2',
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || 'yuujin',
    password: process.env.MYSQL_PASSWORD || 'yuujin123',
    database: process.env.MYSQL_DATABASE || 'yuujin',
    charset: 'utf8mb4',
  };

  // Middleware
  config.middleware = ['cors', 'auth'];

  // Business config
  config.bizConfig = {
    jwt: {
      secret: process.env.JWT_SECRET || 'yuujin-jwt-secret-change-in-production',
      expiresIn: '7d',
      refreshExpiresIn: '30d',
    },
    ai: {
      provider: process.env.AI_PROVIDER || 'ernie',
      claude: {
        apiKey: process.env.CLAUDE_API_KEY || '',
        model: process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001',
      },
      qianwen: {
        apiKey: process.env.QIANWEN_API_KEY || '',
        model: process.env.QIANWEN_MODEL || 'qwen-plus',
      },
      deepseek: {
        apiKey: process.env.DEEPSEEK_API_KEY || '',
        model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      },
      ernie: {
        apiKey: process.env.ERNIE_API_KEY || '',
        model: process.env.ERNIE_MODEL || 'ernie-speed',
      },
    },
    // ProductAI: 高质量模型，用于后台任务（GrowthEngine、话题生成等）
    productAi: {
      provider: process.env.PRODUCT_AI_PROVIDER || 'qianwen',
      claude: {
        apiKey: process.env.CLAUDE_API_KEY || '',
        model: process.env.PRODUCT_CLAUDE_MODEL || 'claude-opus-4-6',
      },
      qianwen: {
        apiKey: process.env.QIANWEN_API_KEY || '',
        model: process.env.PRODUCT_QIANWEN_MODEL || 'qwen-max',
      },
      deepseek: {
        apiKey: process.env.DEEPSEEK_API_KEY || '',
        model: process.env.PRODUCT_DEEPSEEK_MODEL || 'deepseek-reasoner',
      },
      ernie: {
        apiKey: process.env.ERNIE_API_KEY || '',
        model: process.env.PRODUCT_ERNIE_MODEL || 'ernie-4.5',
      },
    },
    redis: {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: Number(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || '',
      db: Number(process.env.REDIS_DB) || 0,
    },
  };

  return config;
};
