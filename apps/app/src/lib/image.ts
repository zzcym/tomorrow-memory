/**
 * 头像选图后的本地缩放（bug #5：App 侧头像上传链）。
 *
 * 为什么放在 App 而不放 `@tm/ui`：`@tm/ui` 是"零 IO、零 DOM 副作用"的展示层
 * （A-14 的 `ui-no-io` 闸），读文件/画 canvas 属于宿主动作，归 App。
 *
 * 口径：等比缩到最长边 ≤ `maxSide`，统一转 JPEG（头像不需要透明），丢质量到 0.86。
 * 不可解码（HEIC 之类）时 reject `decode-failed`，由调用方给人话，不静默失败。
 */

/** 解码失败（浏览器不支持该格式）时的稳定错误标识。 */
export const DECODE_FAILED = 'decode-failed';

export function downscaleImage(file: File, maxSide: number): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let objectUrl = '';
    try {
      objectUrl = URL.createObjectURL(file);
    } catch {
      reject(new Error(DECODE_FAILED));
      return;
    }
    const img = new Image();
    img.onload = (): void => {
      try {
        const longest = Math.max(img.naturalWidth, img.naturalHeight);
        const scale = longest > maxSide && longest > 0 ? maxSide / longest : 1;
        const width = Math.max(1, Math.round(img.naturalWidth * scale));
        const height = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx === null) {
          reject(new Error(DECODE_FAILED));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.86));
      } catch {
        reject(new Error(DECODE_FAILED));
      } finally {
        if (objectUrl !== '') URL.revokeObjectURL(objectUrl);
      }
    };
    img.onerror = (): void => {
      if (objectUrl !== '') URL.revokeObjectURL(objectUrl);
      reject(new Error(DECODE_FAILED));
    };
    img.src = objectUrl;
  });
}
