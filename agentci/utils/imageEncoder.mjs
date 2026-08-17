import fs from "fs";
import path from "path";

const mimeTypes = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

export default function imageEncoder(filePath) {
  const imageBuffer = fs.readFileSync(filePath);
  const base64Image = imageBuffer.toString("base64");
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const mediaType = mimeTypes[ext] || "image/jpeg";
  return `data:${mediaType};base64,${base64Image}`;
}
