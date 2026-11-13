import Servlet.CareSchedule;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** 养护周期计算：是否需要浇水 / 施肥 / 喂食，以及周期的配置优先级。 */
class CareScheduleTest {
    private static final long DAY = CareSchedule.DAY, HOUR = CareSchedule.HOUR;
    private static final long NOW = 1_800_000_000_000L;

    @Test
    void neverDoneIsDue() {
        CareSchedule.Status s = CareSchedule.evaluate(null, 3, NOW);
        assertEquals("due", s.state);
        assertNull(s.nextDueAt);
        assertTrue(s.needsAction());
    }

    @Test
    void notApplicableWhenPeriodZeroOrMissing() {
        assertEquals("na", CareSchedule.evaluate(null, 0, NOW).state);
        assertEquals("na", CareSchedule.evaluate(NOW - 99 * DAY, null, NOW).state);
        assertFalse(CareSchedule.evaluate(null, 0, NOW).needsAction());
    }

    @Test
    void okSoonDueOverdue() {
        assertEquals("ok", CareSchedule.evaluate(NOW - DAY, 3, NOW).state);
        // 3 天周期：最后 20%（14.4 小时）内为“即将到期”
        assertEquals("soon", CareSchedule.evaluate(NOW - 3 * DAY + 10 * HOUR, 3, NOW).state);
        assertEquals("ok", CareSchedule.evaluate(NOW - 3 * DAY + 20 * HOUR, 3, NOW).state);
        CareSchedule.Status due = CareSchedule.evaluate(NOW - 3 * DAY, 3, NOW);
        assertEquals("due", due.state);
        assertEquals(0, due.overdueMs);
        CareSchedule.Status late = CareSchedule.evaluate(NOW - 5 * DAY, 3, NOW);
        assertEquals("due", late.state);
        assertEquals(2 * DAY, late.overdueMs);
        assertEquals(NOW - 2 * DAY, (long) late.nextDueAt);
        // 1 天周期：即将到期窗口至少 6 小时
        assertEquals("soon", CareSchedule.evaluate(NOW - 20 * HOUR, 1, NOW).state);
        assertEquals("ok", CareSchedule.evaluate(NOW - 2 * HOUR, 1, NOW).state);
    }

    @Test
    void justDoneIsOk() {
        assertEquals("ok", CareSchedule.evaluate(NOW, 1, NOW).state);
        assertEquals("ok", CareSchedule.evaluate(NOW, 30, NOW).state);
    }

    @Test
    void periodResolutionOrder() {
        Map<String, Integer> table = new HashMap<>();
        table.put("*plant|water", 4);
        table.put("*plant|fertilize", 20);
        table.put("*animal|feed", 2);
        table.put("lotus|water", 0);
        table.put("willow|water", 7);
        // 个体自身周期优先
        assertEquals(10, CareSchedule.resolvePeriod(10, "willow", "plant", "water", table));
        // 自身 0 / null 视为未配置 → 物种配置
        assertEquals(7, CareSchedule.resolvePeriod(0, "willow", "plant", "water", table));
        assertEquals(0, CareSchedule.resolvePeriod(null, "lotus", "plant", "water", table), "水生植物不需要浇水");
        // 物种没配 → *plant / *animal 默认
        assertEquals(20, CareSchedule.resolvePeriod(null, "willow", "plant", "fertilize", table));
        assertEquals(2, CareSchedule.resolvePeriod(null, "koi", "animal", "feed", table));
        // 表里什么都没有 → 内置默认
        assertEquals(CareSchedule.DEFAULT_WATER_DAYS, CareSchedule.resolvePeriod(null, "x", "plant", "water", new HashMap<>()));
        assertEquals(CareSchedule.DEFAULT_FEED_DAYS, CareSchedule.resolvePeriod(null, null, "animal", "feed", null));
        assertEquals(0, CareSchedule.resolvePeriod(null, null, "animal", "water", null));
    }

    @Test
    void careTypes() {
        assertArrayEquals(new String[]{"feed"}, CareSchedule.careTypesFor("animal"));
        assertArrayEquals(new String[]{"water", "fertilize"}, CareSchedule.careTypesFor("plant"));
        assertEquals("浇水", CareSchedule.label("water"));
        assertEquals("喂食", CareSchedule.legacyType("feed"));
    }
}
