/**
 * OSSService — 阿里云 OSS 上传服务
 *
 * 使用 OSS PutObject REST API（HMAC-SHA1 签名），无需 ali-oss SDK，
 * 仅依赖 Node 内置 crypto + fetch（Node 18+）。
 */

import * as crypto from 'crypto';

export interface OSSConfig {
  region: string;        // e.g. oss-cn-hangzhou
  bucket: string;
  accessKeyId: string;
  accessKeySecret: string;
  /** 公共访问域名, 如不配置则用默认 endpoint */
  cdnDomain?: string;
}

export interface UploadResult {
  /** 对象在 OSS 上的 key */
  key: string;
  /** 可公开访问的 URL */
  url: string;
}

export class OSSService {
  private config: OSSConfig;

  constructor(config: OSSConfig) {
    this.config = config;
  }

  /** 上传 Buffer 到 OSS，返回公开 URL */
  async upload(key: string, data: Buffer, contentType: string): Promise<UploadResult> {
    const { region, bucket, accessKeyId, accessKeySecret, cdnDomain } = this.config;
    const endpoint = `${bucket}.${region}.aliyuncs.com`;
    const url = `https://${endpoint}/${key}`;

    const date = new Date().toUTCString();
    const contentMd5 = crypto.createHash('md5').update(data).digest('base64');

    const stringToSign = [
      'PUT',
      contentMd5,
      contentType,
      date,
      `x-oss-object-acl:public-read\n/${bucket}/${key}`,
    ].join('\n');

    const signature = crypto
      .createHmac('sha1', accessKeySecret)
      .update(stringToSign)
      .digest('base64');

    const authHeader = `OSS ${accessKeyId}:${signature}`;

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: authHeader,
        Date: date,
        'Content-Type': contentType,
        'Content-MD5': contentMd5,
        'x-oss-object-acl': 'public-read',
      },
      body: new Uint8Array(data),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OSS upload failed: ${response.status} ${body}`);
    }

    const publicUrl = cdnDomain
      ? `https://${cdnDomain}/${key}`
      : `https://${endpoint}/${key}`;

    return { key, url: publicUrl };
  }

  /** HEAD 检查对象是否存在，存在则返回公开 URL，不存在返回 null */
  async exists(key: string): Promise<string | null> {
    const { region, bucket, accessKeyId, accessKeySecret, cdnDomain } = this.config;
    const endpoint = `${bucket}.${region}.aliyuncs.com`;
    const url = `https://${endpoint}/${key}`;

    const date = new Date().toUTCString();
    const stringToSign = [
      'HEAD',
      '',
      '',
      date,
      `/${bucket}/${key}`,
    ].join('\n');

    const signature = crypto
      .createHmac('sha1', accessKeySecret)
      .update(stringToSign)
      .digest('base64');

    try {
      const response = await fetch(url, {
        method: 'HEAD',
        headers: {
          Authorization: `OSS ${accessKeyId}:${signature}`,
          Date: date,
        },
      });

      if (response.ok) {
        return cdnDomain
          ? `https://${cdnDomain}/${key}`
          : `https://${endpoint}/${key}`;
      }
      return null;
    } catch {
      return null;
    }
  }
}
