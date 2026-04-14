export interface Config {
  geminiApiKey: string;
  adminUser: string;
  adminPass: string;
  port: number;
  databasePath: string;
  workerIntervalMs: number;
  maxRetryAttempts: number;
  geminiModel: string;
}

export function loadConfig(): Config {
  const geminiApiKey = requireEnv("GEMINI_API_KEY");
  const adminUser = requireEnv("ADMIN_USER");
  const adminPass = requireEnv("ADMIN_PASS");

  return {
    geminiApiKey,
    adminUser,
    adminPass,
    port: parseInt(process.env.PORT || "3000", 10),
    databasePath: process.env.DATABASE_PATH || "./data/pushlog.db",
    workerIntervalMs: parseInt(process.env.WORKER_INTERVAL_MS || "10000", 10),
    maxRetryAttempts: parseInt(process.env.MAX_RETRY_ATTEMPTS || "3", 10),
    geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
