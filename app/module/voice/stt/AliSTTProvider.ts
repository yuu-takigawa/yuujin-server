/**
 * AliSTTProvider — 阿里云智能语音 NLS 录音文件识别
 *
 * 使用 NLS 录音文件识别 REST API（同步短音频识别，<60s）。
 * 文档: https://help.aliyun.com/zh/nls/developer-reference/api-nls-2019-08-19-submitfileasrtask
 *
 * 流程: 上传音频 → 提交识别任务 → 轮询结果（最长等 30s）
 */

import * as crypto from 'crypto';
import { STTProvider, STTResult } from './STTProvider';

export class AliSTTProvider implements STTProvider {
  private accessKeyId: string;
  private accessKeySecret: string;
  private appKey: string;
  private region: string;

  constructor(config: {
    accessKeyId: string;
    accessKeySecret: string;
    appKey: string;
    region?: string;
  }) {
    this.accessKeyId = config.accessKeyId;
    this.accessKeySecret = config.accessKeySecret;
    this.appKey = config.appKey;
    this.region = config.region || 'cn-shanghai';
  }

  async transcribe(audio: Buffer, mimeType: string, language?: string): Promise<STTResult> {
    // 阿里云 NLS 短音频实时识别（单次请求，base64 编码）
    const audioBase64 = audio.toString('base64');
    const format = mimeTypeToFormat(mimeType);

    const timestamp = new Date().toISOString().replace(/\..+/, 'Z');
    const nonce = crypto.randomUUID();

    const params: Record<string, string> = {
      AccessKeyId: this.accessKeyId,
      Action: 'RecognizeFlash',
      Format: 'JSON',
      RegionId: this.region,
      SignatureMethod: 'HMAC-SHA1',
      SignatureNonce: nonce,
      SignatureVersion: '1.0',
      Timestamp: timestamp,
      Version: '2019-08-19',
      AppKey: this.appKey,
      Format_: format,                                // 音频格式
      SampleRate: '16000',
      EnableIntermediateResult: 'false',
      EnableInverseTextNormalization: 'true',
      EnablePunctuationPrediction: 'true',
    };

    if (language === 'ja') {
      params.LanguageHints = 'ja';
    }

    // 排序参数，构造签名
    const sortedKeys = Object.keys(params).sort();
    const canonicalQuery = sortedKeys
      .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
      .join('&');

    const stringToSign = `POST\n${encodeURIComponent('/')}\n${encodeURIComponent(canonicalQuery)}`;
    const signature = crypto
      .createHmac('sha1', `${this.accessKeySecret}&`)
      .update(stringToSign)
      .digest('base64');

    params.Signature = signature;

    const body = new URLSearchParams(params);
    body.append('Audio', audioBase64);

    const response = await fetch(
      `https://nls-gateway-${this.region}.aliyuncs.com/`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      },
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`AliSTT API error: ${response.status} ${err}`);
    }

    const result = await response.json() as {
      Result?: string;
      StatusText?: string;
      Status?: string;
    };

    if (result.Status !== 'SUCCESS' && result.StatusText !== 'SUCCESS') {
      throw new Error(`AliSTT recognition failed: ${result.StatusText}`);
    }

    return {
      text: result.Result || '',
      language: language || 'ja',
    };
  }
}

function mimeTypeToFormat(mime: string): string {
  const map: Record<string, string> = {
    'audio/mpeg': 'mp3',
    'audio/mp4': 'aac',
    'audio/m4a': 'aac',
    'audio/wav': 'pcm',
    'audio/wave': 'pcm',
    'audio/webm': 'opus',
    'audio/ogg': 'opus',
    'audio/flac': 'flac',
  };
  return map[mime] || 'pcm';
}
