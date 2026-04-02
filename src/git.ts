import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export async function getStagedDiff(cwd: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "git",
    ["diff", "--staged", "--unified=3"],
    { cwd, maxBuffer: 1024 * 1024 * 5 }
  );
  return stdout;
}
