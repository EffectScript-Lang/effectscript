import { Config } from "effect"
export const AppConfig = Config.all({
  port: Config.Port("PORT").pipe(Config.withDefault(3000)),
  databaseUrl: Config.Redacted("DATABASE_URL"),
  logLevel: Config.LogLevel("LOG_LEVEL").pipe(Config.withDefault("Info")),
  region: Config.option(Config.Literals(["eu", "us"], "REGION")),
  serviceName: Config.String("SERVICE_NAME"),
  workers: Config.Int("WORKERS").pipe(Config.withDefault(4))
})
