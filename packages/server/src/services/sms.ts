/**
 * 验证码存储与短信发送（与 server.js 行为一致，内存存储，重启清空）
 */

interface CodeRecord {
  code: string;
  expires: number;
  attempts: number;
}

const codeStore = new Map<string, CodeRecord>();

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function storeCode(phone: string, code: string): void {
  codeStore.set(phone, { code, expires: Date.now() + 5 * 60 * 1000, attempts: 0 });
}

function verifyCode(phone: string, code: string): boolean {
  const record = codeStore.get(phone);
  if (!record) return false;
  if (Date.now() > record.expires) {
    codeStore.delete(phone);
    return false;
  }
  record.attempts++;
  if (record.attempts > 5) {
    codeStore.delete(phone);
    return false;
  }
  return record.code === code;
}

function consumeCode(phone: string): void {
  codeStore.delete(phone);
}

/** 是否在 60 秒冷却期内 */
function inCooldown(phone: string): boolean {
  const record = codeStore.get(phone);
  if (!record) return false;
  return Date.now() - (record.expires - 5 * 60 * 1000) < 60000;
}

/**
 * 短信发送接口（预留）
 * TODO: 替换为真实短信服务商（阿里云/腾讯云/云片），见 server_prod.js 注释示例
 */
async function sendSMS(phone: string, code: string): Promise<boolean> {
  console.log(`[DEV] 验证码发送至 ${phone}: ${code}`);
  return true;
}

export interface SmsService {
  generateCode(): string;
  inCooldown(phone: string): boolean;
  storeCode(phone: string, code: string): void;
  verifyCode(phone: string, code: string): boolean;
  consumeCode(phone: string): void;
  sendSMS(phone: string, code: string): Promise<boolean>;
}

export function createSmsService(): SmsService {
  return { generateCode, inCooldown, storeCode, verifyCode, consumeCode, sendSMS };
}
