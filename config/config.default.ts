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
    // STT — 语音转文字（可插拔：dashscope | whisper）
    // dashscope 复用 QIANWEN_API_KEY，无需额外配置
    stt: {
      provider: process.env.STT_PROVIDER || 'dashscope',
      dashscope: {
        // 复用 QIANWEN_API_KEY，此处不单独存储
        model: process.env.DASHSCOPE_STT_MODEL || 'paraformer-realtime-v2',
      },
      whisper: {
        apiKey: process.env.OPENAI_API_KEY || '',
        baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        model: process.env.WHISPER_MODEL || 'whisper-1',
      },
    },
    // OSS — 用户头像上传（华东1杭州）
    oss: {
      region: process.env.OSS_REGION || 'oss-cn-hangzhou',
      bucket: process.env.OSS_BUCKET || 'yuujin-assets',
      accessKeyId: process.env.OSS_ACCESS_KEY_ID || '',
      accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || '',
      // 不单独买 CDN，直接用 OSS 公网访问域名
      cdnDomain: process.env.OSS_CDN_DOMAIN || 'yuujin-assets.oss-cn-hangzhou.aliyuncs.com',
    },
    redis: {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: Number(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || '',
      db: Number(process.env.REDIS_DB) || 0,
    },
    smtp: {
      host: process.env.SMTP_HOST || 'smtpdm.aliyun.com',
      port: Number(process.env.SMTP_PORT) || 465,
      secure: true,
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
      },
      from: process.env.SMTP_FROM || 'noreply@yuujin.cc',
    },
  };

  return config;
};
