import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listOperationHistoryMock: vi.fn(),
}));

vi.mock("@/lib/operation-history", () => ({
  listOperationHistory: mocks.listOperationHistoryMock,
}));

import { GET } from "./route";

describe("GET /api/history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns history items", async () => {
    mocks.listOperationHistoryMock.mockReturnValueOnce([
      {
        id: "op-1",
        actionType: "update_chapters_read",
        entityType: "series",
        entityId: "series-1",
        titleSnapshot: "A",
        createdAt: "2026-05-26T00:00:00.000Z",
        undoneAt: null,
      },
    ]);

    const request = new Request("http://localhost/api/history?limit=20&maxAgeDays=7");
    const response = await GET(request as never);
    const body = (await response.json()) as { data: Array<{ id: string }> };

    expect(response.status).toBe(200);
    expect(body.data[0]?.id).toBe("op-1");
    expect(mocks.listOperationHistoryMock).toHaveBeenCalledWith(20, 7);
  });

  it("validates limit", async () => {
    const request = new Request("http://localhost/api/history?limit=999");
    const response = await GET(request as never);

    expect(response.status).toBe(400);
  });
});
