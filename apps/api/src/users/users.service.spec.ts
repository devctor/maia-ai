import { describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../config/env";
import type { UserRow } from "../db/schema";
import type { UsersRepository } from "./users.repository";
import { UsersService } from "./users.service";

const user: UserRow = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "ana@example.com",
  displayName: "Ana",
  createdAt: new Date("2025-01-01T10:00:00.000Z"),
};

const appConfig: AppConfig = {
  nodeEnv: "test",
  port: 3001,
  corsOrigins: ["http://localhost:3000"],
  demoUser: { email: user.email, name: user.displayName },
  diagnosticsEnabled: false,
};

describe("UsersService", () => {
  it("resolves the configured demo user through the repository", async () => {
    const ensureDemoUser = vi.fn(async (_input: { email: string; name: string }) => user);
    const repository = { ensureDemoUser } as unknown as UsersRepository;
    const service = new UsersService(appConfig, repository);

    await expect(service.getDemoUser()).resolves.toBe(user);
    expect(ensureDemoUser).toHaveBeenCalledWith(appConfig.demoUser);
  });
});
