export function checkEnvironmentVariables() {
  const requiredEnvVars = [
    "SERVER_URL",
    "NODE_APP_PORT",
    "NODE_ENV",
    "GRAPHQL_URL",
    "CLIENT_ID",
    "CLIENT_SECRET",
    "SIGNING_SECRET",
    "APP_ID",
    "ENVIRONMENT",
    "ACCESS_TOKEN",
    "LOGGING_APP_NAME",
    "LOGGING_APP_KEY",
  ];
  const missingVars = requiredEnvVars.filter(
    (varName) => !process.env[varName],
  );

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(", ")}`,
    );
  }
}
