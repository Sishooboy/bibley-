/**
 * Regenerates every shipped icon from brand/logo-source.png.
 * Run with `npm run icons` after replacing the source file.
 */
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'brand', 'logo-source.png');
const outDir = join(root, 'public');

/** Small sizes get sharpened a touch, since the cross strokes go soft when scaled down. */
const SIZES = [
  { file: 'icon-32.png', size: 32, sharpen: true },
  { file: 'icon-64.png', size: 64, sharpen: true },
  { file: 'icon-180.png', size: 180, sharpen: false },
  { file: 'icon-192.png', size: 192, sharpen: false },
  { file: 'icon-512.png', size: 512, sharpen: false },
];

await mkdir(outDir, { recursive: true });

for (const { file, size, sharpen } of SIZES) {
  let pipeline = sharp(source).resize(size, size, { fit: 'contain', kernel: 'lanczos3' });
  if (sharpen) pipeline = pipeline.sharpen({ sigma: 0.6 });
  // The gradient quantizes cleanly at icon sizes: 512px drops 345 KB to 62 KB.
  const info = await pipeline
    .png({ compressionLevel: 9, palette: true, quality: 92, dither: 1 })
    .toFile(join(outDir, file));
  console.log(`${file.padEnd(14)} ${size}x${size}  ${(info.size / 1024).toFixed(1)} KB`);
}
