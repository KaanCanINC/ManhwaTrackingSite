import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getGoalsSummaryMock: vi.fn(),
}));

vi.mock("@/lib/goals-service", () => ({
  getGoalsSummary: mocks.getGoalsSummaryMock,
}));

import { GET } from "./route";

describe("GET /api/goals/summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns goal summary payload", async () => {
    mocks.getGoalsSummaryMock.mockReturnValueOnce({
      weeklyChapter: {
        metricType: "weekly_chapter_goal",
        periodType: "week",
        targetValue: 40,
        actualValue: 12,
        remainingValue: 28,
        percent: 30,
        trendLast4Avg: 18,
        estimatedFinishDate: null,
      },
      monthlyChapter: null,
      monthlyCompleted: null,
    });

    const response = await GET();
    const body = (await response.json()) as {
      data: { weeklyChapter: { metricType: string } | null };
    };

    expect(response.status).toBe(200);
    expect(body.data.weeklyChapter?.metricType).toBe("weekly_chapter_goal");
  });
});
