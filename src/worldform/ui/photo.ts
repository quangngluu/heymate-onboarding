import type { IdentityPhoto } from '../domain/types';

const SUPPORTED = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const MAX_EDGE = 1024;

function blobDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không thể đọc ảnh này.'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

/** Resize before persistence so one identity photo cannot exhaust localStorage. */
export async function prepareIdentityPhoto(file: File): Promise<IdentityPhoto> {
  if (!SUPPORTED.has(file.type)) throw new Error('Hãy dùng ảnh JPG, PNG hoặc WebP.');
  if (!file.size || file.size > MAX_SOURCE_BYTES) throw new Error('Ảnh phải nhỏ hơn 12 MB.');

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error('Trình duyệt không thể chuẩn bị ảnh này.');
  }
  context.fillStyle = '#ece8e0';
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error('Không thể nén ảnh này.'))),
      'image/jpeg',
      0.84
    );
  });
  return {
    fileName: file.name.replace(/\.[^.]+$/, '') + '.jpg',
    mimeType: 'image/jpeg',
    dataUri: await blobDataUri(blob),
    width,
    height,
  };
}
