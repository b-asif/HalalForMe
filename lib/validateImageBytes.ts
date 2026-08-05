/**
 * Validates that a Uint8Array starts with recognized image magic bytes.
 * Guards against callers who convert non-image files to base64 and upload
 * them with a declared image/jpeg content-type to bypass the RLS MIME check.
 *
 * JPEG: FF D8 FF
 * PNG:  89 50 4E 47
 * HEIC/HEIF: bytes 4–7 === "ftyp" (ISO Base Media File Format used on iOS)
 * WebP: bytes 0–3 === "RIFF" and bytes 8–11 === "WEBP"
 */
export function isValidImageBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;

  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng  = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  // HEIC/HEIF: size (4 bytes) + "ftyp" at offset 4
  const isHeic = bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
  // WebP: "RIFF" at 0, "WEBP" at 8
  const isWebp = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
              && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;

  return isJpeg || isPng || isHeic || isWebp;
}
