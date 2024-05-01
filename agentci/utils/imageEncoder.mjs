import fs from "fs";

export default function imageEncoder(filePath) {
  const imageBuffer = fs.readFileSync(filePath);
  const base64Image = imageBuffer.toString("base64");
  return `data:image/jpeg;base64,{${base64Image}}`;
}
