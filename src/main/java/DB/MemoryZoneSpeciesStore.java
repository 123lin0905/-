package DB;

import org.example.demo1.ZoneSpecies;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/** 内存实现：单元测试与无数据库演示用（进程重启即丢失）。 */
public class MemoryZoneSpeciesStore implements ZoneSpeciesStore {
    private final Map<Long, ZoneSpecies> rows = new ConcurrentHashMap<>();
    private final AtomicLong seq = new AtomicLong();

    private static String now() { return new SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(new Date()); }

    @Override
    public List<ZoneSpecies> list(String zoneId) {
        List<ZoneSpecies> out = new ArrayList<>();
        rows.values().stream().filter(r -> r.getZoneId().equals(zoneId)).sorted((a, b) -> Long.compare(a.getId(), b.getId())).forEach(r -> out.add(r.copy()));
        return out;
    }

    @Override
    public ZoneSpecies get(String zoneId, long id) {
        ZoneSpecies r = rows.get(id);
        return r != null && r.getZoneId().equals(zoneId) ? r.copy() : null;
    }

    @Override
    public ZoneSpecies findBySeed(String zoneId, String seedRef) {
        return rows.values().stream().filter(r -> r.getZoneId().equals(zoneId) && seedRef.equals(r.getSeedRef())).findFirst().map(ZoneSpecies::copy).orElse(null);
    }

    @Override
    public ZoneSpecies insert(ZoneSpecies s) {
        ZoneSpecies c = s.copy();
        c.setId(seq.incrementAndGet());
        c.setCreatedAt(now()); c.setUpdatedAt(c.getCreatedAt());
        rows.put(c.getId(), c);
        return c.copy();
    }

    @Override
    public ZoneSpecies update(ZoneSpecies s) {
        ZoneSpecies c = s.copy();
        c.setUpdatedAt(now());
        rows.put(c.getId(), c);
        return c.copy();
    }
}
