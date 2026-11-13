package Servlet;

import java.util.Map;

/**
 * 养护周期计算（纯计算，便于单元测试）：按“上次操作时间 + 物种养护周期”判断是否需要浇水 / 施肥 / 喂食。
 * <pre>
 * 周期 ≤ 0 或未配置        → na（不需要，如水生植物不用浇水、野生鸟类不投喂）
 * 从未做过                  → due（需要）
 * 现在 ≥ 上次 + 周期        → due（已到期 / 逾期）
 * 剩余时间 ≤ 周期 × 20%（且至少 6 小时）→ soon（即将到期）
 * 其余                      → ok
 * </pre>
 * 周期来源（可配置）：care_period 表按 species_key 配置，*plant / *animal 为默认值；
 * plant 表个体优先用自身 water_period_days / fertilize_period_days，animal 表个体优先用 feeding_cycle_days。
 */
public final class CareSchedule {
    private CareSchedule() {
    }

    public static final String WATER = "water", FERTILIZE = "fertilize", FEED = "feed";
    public static final long HOUR = 3600_000L, DAY = 24 * HOUR;

    /** 内置默认周期（天），care_period 表没配时使用。 */
    public static final int DEFAULT_WATER_DAYS = 3, DEFAULT_FERTILIZE_DAYS = 30, DEFAULT_FEED_DAYS = 1;

    public static final class Status {
        public final String state;          // na / due / soon / ok
        public final Long nextDueAt;        // 下次到期时间（毫秒），从未做过或不需要时为 null
        public final long overdueMs;        // 逾期多久（毫秒），未逾期为 0

        Status(String state, Long nextDueAt, long overdueMs) {
            this.state = state;
            this.nextDueAt = nextDueAt;
            this.overdueMs = overdueMs;
        }

        public boolean needsAction() { return "due".equals(state); }
    }

    public static Status evaluate(Long lastAt, Integer periodDays, long now) {
        if (periodDays == null || periodDays <= 0) return new Status("na", null, 0);
        if (lastAt == null) return new Status("due", null, 0);
        long period = periodDays * DAY;
        long next = lastAt + period;
        if (now >= next) return new Status("due", next, now - next);
        long remain = next - now;
        long soonWindow = Math.max(6 * HOUR, period / 5);
        return new Status(remain <= soonWindow ? "soon" : "ok", next, 0);
    }

    public static String label(String careType) {
        if (WATER.equals(careType)) return "浇水";
        if (FERTILIZE.equals(careType)) return "施肥";
        if (FEED.equals(careType)) return "喂食";
        return careType;
    }

    /** care_type → plant_maintenance.mtype（与原养护台账一致）。 */
    public static String legacyType(String careType) {
        return WATER.equals(careType) ? "浇水" : FERTILIZE.equals(careType) ? "施肥" : FEED.equals(careType) ? "喂食" : careType;
    }

    /**
     * 周期查找：先看个体自身周期（>0 时生效，0 / null 视为未配置），再看 care_period 按物种 key，最后看 *plant / *animal 默认，最后内置默认值。
     * care_period 里配置 0 表示“该物种不需要这项养护”。
     */
    public static Integer resolvePeriod(Integer own, String speciesKey, String speciesType, String careType, Map<String, Integer> table) {
        if (own != null && own > 0) return own;
        if (table != null) {
            if (speciesKey != null) {
                Integer v = table.get(speciesKey + "|" + careType);
                if (v != null) return v;
            }
            Integer d = table.get("*" + speciesType + "|" + careType);
            if (d != null) return d;
        }
        if ("plant".equals(speciesType)) {
            if (WATER.equals(careType)) return DEFAULT_WATER_DAYS;
            if (FERTILIZE.equals(careType)) return DEFAULT_FERTILIZE_DAYS;
        }
        if ("animal".equals(speciesType) && FEED.equals(careType)) return DEFAULT_FEED_DAYS;
        return 0;
    }

    /** 某类个体适用的养护项目：植物浇水 + 施肥，动物喂食。 */
    public static String[] careTypesFor(String speciesType) {
        return "animal".equals(speciesType) ? new String[]{FEED} : new String[]{WATER, FERTILIZE};
    }
}
