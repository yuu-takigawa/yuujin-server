/**
 * ContentModerationService — 阿里云内容安全图片审核
 *
 * 分层审核：
 *   1. MIME 类型校验（本地）
 *   2. 阿里云图片审核 API（内容安全）
 *   3. 可选：命中敏感分类后进入人工审核队列
 *
 * API文档: https://help.aliyun.com/zh/content-moderation/
 */

import * as crypto from 'crypto';

export interface ModerationConfig {
  accessKeyId: string;
  accessKeySecret: string;
  /** 内容安全区域，默认 cn-shanghai */
  region?: string;
}

export interface ModerationResult {
  pass: boolean;
  /** 未通过时的原因（risk label） */
  reason?: string;
  /** 是否需要人工审核 */
  needsReview?: boolean;
}

/** 允许的图片 MIME 类型 */
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

/** 允许的最大文件大小（5MB） */
const MAX_FILE_SIZE = 5 * 1024 * 1024;

export class ContentModerationService {
  private config: ModerationConfig;

  constructor(config: ModerationConfig) {
    this.config = config;
  }

  /** 第一层：MIME 类型 + 文件大小本地校验 */
  checkMime(mimeType: string, size: number): { ok: boolean; reason?: string } {
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return { ok: false, reason: `Unsupported file type: ${mimeType}` };
    }
    if (size > MAX_FILE_SIZE) {
      return { ok: false, reason: `File too large: ${size} bytes (max 5MB)` };
    }
    return { ok: true };
  }

  /** 第二层：阿里云内容安全 API 审核 */
  async moderate(imageUrl: string): Promise<ModerationResult> {
    if (!this.config.accessKeyId || !this.config.accessKeySecret) {
      // 未配置密钥时直接通过（开发环境）
      return { pass: true };
    }

    try {
      const region = this.config.region || 'cn-shanghai';
      const host = `green-cip.${region}.aliyuncs.com`;
      const path = '/green/image/scan';
      const date = new Date().toISOString();
      const nonce = crypto.randomUUID();

      const body = JSON.stringify({
        tasks: [{ dataId: nonce, url: imageUrl }],
        scenes: ['porn', 'terrorism', 'ad'],
      });

      const contentMd5 = crypto.createHash('md5').update(body).digest('base64');
      const contentType = 'application/json';

      const stringToSign = [
        'POST',
        contentMd5,
        contentType,
        date,
        `x-acs-signature-method:HMAC-SHA1`,
        `x-acs-signature-nonce:${nonce}`,
        `x-acs-version:2018-05-09`,
        path,
      ].join('\n');

      const signature = crypto
        .createHmac('sha1', this.config.accessKeySecret)
        .update(stringToSign)
        .digest('base64');

      const response = await fetch(`https://${host}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `acs ${this.config.accessKeyId}:${signature}`,
          Date: date,
          'Content-Type': contentType,
          'Content-MD5': contentMd5,
          'x-acs-signature-method': 'HMAC-SHA1',
          'x-acs-signature-nonce': nonce,
          'x-acs-version': '2018-05-09',
        },
        body,
      });

      if (!response.ok) return { pass: true }; // 审核服务异常时放行

      const result = await response.json() as {
        data?: Array<{
          results?: Array<{ suggestion: string; label: string }>;
        }>;
      };

      const taskResult = result.data?.[0]?.results;
      if (!taskResult) return { pass: true };

      // 有任意场景 block 则拒绝，review 则进人工审核
      for (const r of taskResult) {
        if (r.suggestion === 'block') {
          return { pass: false, reason: r.label };
        }
        if (r.suggestion === 'review') {
          return { pass: true, needsReview: true };
        }
      }

      return { pass: true };
    } catch {
      // 审核服务异常，允许通过但标记 needsReview
      return { pass: true, needsReview: true };
    }
  }
}
