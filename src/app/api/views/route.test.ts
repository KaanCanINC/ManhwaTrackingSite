import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listSavedViewsMock: vi.fn(),
  createSavedViewMock: vi.fn(),
}));

vi.mock("@/lib/views-service", () => ({
  listSavedViews: mocks.listSavedViewsMock,
  createSavedView: mocks.createSavedViewMock,
}));

import { GET, POST } from "./route";

describe("/api/views route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET returns saved views", async () => {
    mocks.listSavedViewsMock.mockReturnValueOnce([{ id: "view-1", name: "Reading", mode: "dynamic" }]);

    const response = await GET();
    const body = (await response.json()) as { data: Array<{ id: string }> };

    expect(response.status).toBe(200);
    expect(body.data[0]?.id).toBe("view-1");
  });

  it("POST creates a view", async () => {
    mocks.createSavedViewMock.mockReturnValueOnce({ id: "view-2", name: "Collection" });

    const request = new Request("http://localhost/api/views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Collection", mode: "collection", seriesIds: ["s1"] }),
    });

    const response = await POST(request as never);
    const body = (await response.json()) as { data: { id: string } };

    expect(response.status).toBe(201);
    expect(body.data.id).toBe("view-2");
  });
});
