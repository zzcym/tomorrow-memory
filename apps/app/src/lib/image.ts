/**
 * 头像选图后的本地缩放（bug #5：App 侧头像上传链）。
 *
 * 为什么放在 App 而不放 `@tm/ui`：`@tm/ui` 是"零 IO、零 DOM 副作用"的展示层
 * （A-14 的 `ui-no-io` 闸），读文件/画 canvas 属于宿主动作，归 App。
 *
 * 口径：**先按短边中心裁成正方形**（圆形容器里不变形），再缩到 ≤ `maxSide`，统一转 JPEG、质量 0.86。
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
        // bug #12-3：头像必须是**正方形**，否则塞进圆形容器会被拉变形。
        // 做法 = 先按短边中心裁成正方形，再等比缩到 ≤maxSide，最后画到正方形画布上。
        const side = Math.max(1, Math.min(img.naturalWidth, img.naturalHeight));
        const target = Math.max(1, Math.min(maxSide, side));
        const sx = Math.max(0, (img.naturalWidth - side) / 2);
        const sy = Math.max(0, (img.naturalHeight - side) / 2);
        const canvas = document.createElement('canvas');
        canvas.width = target;
        canvas.height = target;
        const ctx = canvas.getContext('2d');
        if (ctx === null) {
          reject(new Error(DECODE_FAILED));
          return;
        }
        ctx.drawImage(img, sx, sy, side, side, 0, 0, target, target);
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
