import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  undoOperationByIdMock: vi.fn(),
  createChangeBackupIfCooledDownMock: vi.fn(),
}));

vi.mock("@/lib/operation-history", () => ({
  undoOperationById: mocks.undoOperationByIdMock,
}));

vi.mock("@/lib/backup-service", () => ({
  createChangeBackupIfCooledDown: mocks.createChangeBackupIfCooledDownMock,
}));

import { POST } from "./route";

describe("POST /api/history/[id]/undo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires explicit confirmation", async () => {
    const request = new Request("http://localhost/api/history/op-1/undo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: false }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: "op-1" }) });

    expect(response.status).toBe(400);
    expect(mocks.undoOperationByIdMock).not.toHaveBeenCalled();
  });

  it("returns undo result", async () => {
    mocks.undoOperationByIdMock.mockReturnValueOnce({
      operationId: "op-1",
      undoOperationId: "op-2",
      entityId: "series-1",
      actionType: "delete_series",
    });

    const request = new Request("http://localhost/api/history/op-1/undo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: "op-1" }) });
    const body = (await response.json()) as { data: { undoOperationId: string } };

    expect(response.status).toBe(200);
    expect(body.data.undoOperationId).toBe("op-2");
    expect(mocks.createChangeBackupIfCooledDownMock).toHaveBeenCalledTimes(1);
  });

  it("maps not found errors to 404", async () => {
    mocks.undoOperationByIdMock.mockImplementationOnce(() => {
      throw new Error("Operation not found");
    });

    const request = new Request("http://localhost/api/history/op-404/undo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: "op-404" }) });

    expect(response.status).toBe(404);
  });
});
