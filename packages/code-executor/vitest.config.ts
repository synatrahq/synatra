import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    env: {
      SERVICE_SECRET: "test-service-secret-at-least-32-chars-long",
      RESOURCE_GATEWAY_URL: "http://localhost:3002",
      CODE_EXECUTOR_URL: "http://localhost:3001",
    },
  },
})
