import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  restoreByBackupIdMock: vi.fn(),
}));

vi.mock("@/lib/backup-service", () => ({
  restoreByBackupId: mocks.restoreByBackupIdMock,
}));

import { POST } from "./route";

describe("POST /api/backups/[id]/restore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires explicit confirmation", async () => {
    const request = new Request("http://localhost/api/backups/abc/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: false }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: "abc" }) });
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toContain("explicit confirmation");
    expect(mocks.restoreByBackupIdMock).not.toHaveBeenCalled();
  });

  it("returns 404 when backup is missing", async () => {
    mocks.restoreByBackupIdMock.mockRejectedValueOnce(new Error("Backup not found"));

    const request = new Request("http://localhost/api/backups/abc/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: "abc" }) });

    expect(response.status).toBe(404);
  });

  it("returns restore result when successful", async () => {
    mocks.restoreByBackupIdMock.mockResolvedValueOnce({
      backupId: "abc",
      restoredSeries: 3,
      restoredSources: 5,
      deletedSeries: 2,
      preRestoreBackupFileName: "backup-pre.json",
    });

    const request = new Request("http://localhost/api/backups/abc/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: "abc" }) });
    const body = (await response.json()) as { data: { restoredSeries: number } };

    expect(response.status).toBe(200);
    expect(body.data.restoredSeries).toBe(3);
    expect(mocks.restoreByBackupIdMock).toHaveBeenCalledWith("abc");
  });
});
