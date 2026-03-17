/**
 * STTProvider — 语音转文字可插拔接口
 *
 * 实现:
 *   AliSTTProvider  — 阿里云 NLS（国内，推荐）
 *   WhisperProvider — OpenAI Whisper API（国际）
 *
 * 切换: 通过环境变量 STT_PROVIDER=ali|whisper
 */

export interface STTResult {
  text: string;
  /** 检测到的语言（如 ja、zh 等） */
  language?: string;
  /** 置信度 0-1 */
  confidence?: number;
}

export interface STTProvider {
  /**
   * 将音频 Buffer 转为文字
   * @param audio    音频数据（m4a / wav / webm 等）
   * @param mimeType 音频 MIME 类型
   * @param language 提示语言（'ja' | 'zh' 等），可选
   */
  transcribe(audio: Buffer, mimeType: string, language?: string): Promise<STTResult>;
}
