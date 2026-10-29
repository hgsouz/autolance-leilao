import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 30000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        "postgres://postgres:postgres@localhost:5433/leilao_test",
      JWT_SECRET: "test-jwt-secret-test-jwt-secret",
      CHAIN_SECRET: "test-chain-secret-test-chain-secret",
      CORS_ORIGIN: "*",
    },
  },
});
