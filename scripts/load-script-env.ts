import { loadEnvConfig } from "@next/env";

export function loadScriptEnv(scriptName: string, secretNames: string[] = []) {
  const projectDir = process.cwd();
  const result = loadEnvConfig(projectDir);
  const loadedFiles = result.loadedEnvFiles.map((file) => file.path).filter(Boolean);

  console.log(
    `${scriptName} env files loaded: ${loadedFiles.length > 0 ? loadedFiles.join(", ") : "none"}`
  );

  for (const secretName of secretNames) {
    console.log(`${secretName} detected: ${process.env[secretName] ? "yes" : "no"}`);
  }
}
