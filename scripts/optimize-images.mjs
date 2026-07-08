import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const sourceDir = path.resolve("public/img");
const outputDir = path.resolve("public/img/optimized");
const metadataPath = path.resolve("src/image-metadata.json");
const widths = [400, 800, 1200];
const supportedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function getSourceFiles() {
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((fileName) => supportedExtensions.has(path.extname(fileName).toLowerCase()))
    .filter((fileName) => fileName !== ".DS_Store");
}

async function optimizeImage(fileName) {
  const sourcePath = path.join(sourceDir, fileName);
  const { name } = path.parse(fileName);
  const metadata = await sharp(sourcePath).metadata();

  await Promise.all(
    widths.flatMap(async (width) => {
      const widthDir = path.join(outputDir, String(width));
      await ensureDir(widthDir);

      const webpPath = path.join(widthDir, `${name}.webp`);
      const jpgPath = path.join(widthDir, `${name}.jpg`);
      const image = sharp(sourcePath).rotate().resize({
        width,
        withoutEnlargement: true,
      });

      await Promise.all([
        image.clone().webp({ quality: 78 }).toFile(webpPath),
        image.clone().jpeg({ quality: 78, mozjpeg: true }).toFile(jpgPath),
      ]);
    }),
  );

  return {
    src: `/img/${fileName}`,
    width: metadata.width,
    height: metadata.height,
    aspectRatio:
      metadata.width && metadata.height ? metadata.width / metadata.height : 1,
  };
}

const files = await getSourceFiles();

await ensureDir(outputDir);
const metadata = await Promise.all(files.map(optimizeImage));

await fs.writeFile(
  metadataPath,
  `${JSON.stringify(
    Object.fromEntries(metadata.map((image) => [image.src, image])),
    null,
    2,
  )}\n`,
);

console.log(
  `Optimized ${files.length} images at ${widths.join(", ")}px and wrote image metadata.`,
);
