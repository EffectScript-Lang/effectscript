// Every variable is read, parsed, defaulted and validated by hand
function readConfig() {
  const port = Number(process.env.PORT ?? "3000")
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("PORT: expected a port")
  const databaseUrl = process.env.DATABASE_URL
  if (databaseUrl === undefined) throw new Error("DATABASE_URL is required")
  const logLevel = process.env.LOG_LEVEL ?? "Info"
  if (!["Debug", "Info", "Warning", "Error"].includes(logLevel)) throw new Error("LOG_LEVEL: invalid")
  const workers = Number(process.env.WORKERS ?? "4")
  if (!Number.isInteger(workers)) throw new Error("WORKERS: expected an integer")
  return { port, databaseUrl, logLevel, workers }
}

export function describeServer() {
  const config = readConfig()
  return `port ${config.port} with ${config.workers} workers`
}
