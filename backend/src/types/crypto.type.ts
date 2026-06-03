// 1. 共用的 AES 加密 Payload 格式 (AES-256-GCM)
export interface AesEncryptedPayload {
  iv: string;
  ciphertext: string;
  tag: string;
  device_uuid: string;
}

// 2. 註冊裝置 DTO (階段一)
export interface RegisterDeviceDTO {
  device_uuid: string;
  encrypted_aes_key: string;
}

// 3. 登入解密後的明文結構 (階段二)
export interface LoginDecryptedPayload {
  testId: string;
  password?: string;
}

// 4. 取得測資解密後的明文結構 (階段三)
export interface GetTestCaseDecryptedPayload {
  session_token: string;
  timestamp: number;
  nonce: string;
  question_id: string;
}
