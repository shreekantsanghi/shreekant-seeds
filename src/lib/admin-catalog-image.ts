/** Validated image MIME type → the only extension ever stored. */
export const IMAGE_EXTENSIONS = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export type AllowedImageType = keyof typeof IMAGE_EXTENSIONS;

/** Detects JPEG/PNG/WebP from the file's first bytes; anything else (SVG, GIF, HTML…) returns null. */
export function sniffImageType(bytes: Uint8Array): AllowedImageType | null {
  const at = (i: number, ...sig: number[]) => sig.every((b, k) => bytes[i + k] === b);
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  return null;
}
