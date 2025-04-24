import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { promisify } from "node:util";
import childProcess from "node:child_process";

const exec = promisify(childProcess.exec);

interface Config {
  ignore?: string[];
}

async function safeDelete(targetDir: string, config: Config) {
  const absoluteTarget = path.resolve(targetDir);

  if (!fs.existsSync(absoluteTarget)) {
    console.error(`Error: Target directory ${absoluteTarget} does not exist`);
    process.exit(1);
  }

  const tmpDir = path.join(os.tmpdir(), `backup-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  console.log(`Created temp directory: ${tmpDir}`);

  const normalizedIgnores = (config.ignore || []).map((ignorePath) =>
    path.normalize(ignorePath).replace(/\\/g, "/"),
  );

  for (const ignorePath of normalizedIgnores) {
    const sourcePath = path.join(absoluteTarget, ignorePath);

    if (fs.existsSync(sourcePath)) {
      const destPath = path.join(tmpDir, ignorePath);
      const destDir = path.dirname(destPath);

      fs.mkdirSync(destDir, { recursive: true });

      try {
        if (fs.lstatSync(sourcePath).isDirectory()) {
          await exec(`cp -r "${sourcePath}" "${destPath}"`);
        } else {
          fs.copyFileSync(sourcePath, destPath);
        }
        console.log(`Copied to temp: ${sourcePath} → ${destPath}`);
      } catch (error) {
        console.error(`Error copying ${sourcePath}: ${error}`);
      }
    }
  }

  console.log("Deleting all files...");
  try {
    const files = fs.readdirSync(absoluteTarget);
    for (const file of files) {
      if (file === ".git") continue;

      const fullPath = path.join(absoluteTarget, file);
      try {
        fs.rmSync(fullPath, { recursive: true, force: true });
        console.log(`Deleted: ${fullPath}`);
      } catch (error) {
        console.error(`Error deleting ${fullPath}: ${error}`);
      }
    }
  } catch (error) {
    console.error(`Error cleaning directory: ${error}`);
  }

  console.log("Restoring files from temp...");
  try {
    const restoreFiles = fs.readdirSync(tmpDir);
    for (const file of restoreFiles) {
      const sourcePath = path.join(tmpDir, file);
      const destPath = path.join(absoluteTarget, file);

      try {
        if (fs.lstatSync(sourcePath).isDirectory()) {
          await exec(`cp -r "${sourcePath}" "${destPath}"`);
        } else {
          fs.copyFileSync(sourcePath, destPath);
        }
        console.log(`Restored: ${sourcePath} → ${destPath}`);
      } catch (error) {
        console.error(`Error restoring ${sourcePath}: ${error}`);
      }
    }
  } catch (error) {
    console.error(`Error restoring files: ${error}`);
  }

  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    console.log(`Cleaned temp directory: ${tmpDir}`);
  } catch (error) {
    console.error(`Error cleaning temp directory: ${error}`);
  }
}

if (process.argv.length < 3) {
  console.error("Usage: node script.js <config_json> <target_dir>");
  process.exit(1);
}

(async () => {
  try {
    const [configString, targetDir] = process.argv.slice(2);
    const config = JSON.parse(configString);

    console.log("Starting cleanup process...");
    await safeDelete(targetDir, config);
    console.log("Cleanup completed successfully!");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
})();
