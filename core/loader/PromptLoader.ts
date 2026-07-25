import fs from "fs";
import path from "path";

export class PromptLoader {
  private basePath = path.join(process.cwd(), "core", "prompt");

  load(fileName: string): string {
    const filePath = path.join(this.basePath, fileName);

    return fs.readFileSync(filePath, "utf-8");
  }
}