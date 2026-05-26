import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  previewRestoreByBackupIdMock: vi.fn(),
}));

vi.mock("@/lib/backup-service", () => ({
  previewRestoreByBackupId: mocks.previewRestoreByBackupIdMock,
}));

import { POST } from "./route";

describe("POST /api/backups/[id]/restore/preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns preview payload", async () => {
    mocks.previewRestoreByBackupIdMock.mockResolvedValueOnce({
      backupId: "abc",
      backupFileName: "backup.json",
      snapshotCreatedAt: "2026-01-01T00:00:00.000Z",
      totalInBackup: 10,
      totalCurrent: 8,
      toAdd: 3,
      toUpdate: 5,
      toDelete: 1,
    });

    const request = new Request("http://localhost/api/backups/abc/restore/preview", {
      method: "POST",
    });

    const response = await POST(request, { params: Promise.resolve({ id: "abc" }) });
    const body = (await response.json()) as { data: { backupId: string } };

    expect(response.status).toBe(200);
    expect(body.data.backupId).toBe("abc");
  });

  it("maps missing backup to 404", async () => {
    mocks.previewRestoreByBackupIdMock.mockRejectedValueOnce(new Error("Backup not found"));

    const request = new Request("http://localhost/api/backups/abc/restore/preview", {
      method: "POST",
    });

    const response = await POST(request, { params: Promise.resolve({ id: "abc" }) });

    expect(response.status).toBe(404);
  });
});
