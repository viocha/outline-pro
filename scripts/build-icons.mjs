import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const sourcePath = path.join(rootDir, 'assets', 'icon', 'outline-pro.svg');
const outputDir = path.join(rootDir, 'public', 'icon');
const sizes = [16, 32, 48, 128];

async function buildIcons() {
  const svg = await readFile(sourcePath);

  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  for (const size of sizes) {
    const outputPath = path.join(outputDir, `${size}.png`);

    await sharp(svg, { density: size * 8 })
      .resize(size, size)
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(outputPath);

    console.log(`generated ${path.relative(rootDir, outputPath)}`);
  }
}

buildIcons().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
