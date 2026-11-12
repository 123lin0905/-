import DB.MemoryZoneSpeciesStore;
import DB.MiniJson;
import DB.ZoneSpeciesStore;
import Servlet.ZoneSpeciesService;
import org.example.demo1.ZoneSpecies;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 动植物增删接口的业务逻辑测试（内存存储，不需要数据库）：
 * mvn -Dtest=ZoneSpeciesServiceTest test
 */
public class ZoneSpeciesServiceTest {
    private static final String ZONES = "{\"zones\":[" +
            "{\"id\":\"cuihu_water\",\"name\":\"翠湖水景\",\"area_code\":\"MY-ECO-CUIHU\",\"editable\":true,\"catalog\":[\"lotus\",\"koi\"]}," +
            "{\"id\":\"central_lawn\",\"name\":\"中心草坪\",\"area_code\":\"MY-ECO-LAWN\",\"editable\":false,\"catalog\":null}]}";
    private Map<String, ZoneSpeciesService.Zone> zones;
    private ZoneSpeciesService svc;

    @BeforeEach
    void setUp() {
        zones = ZoneSpeciesService.parseZones(ZONES);
        svc = new ZoneSpeciesService(new MemoryZoneSpeciesStore());
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> item(ZoneSpeciesService.Result r) {
        return (Map<String, Object>) MiniJson.parseObject(r.json()).get("item");
    }

    @Test
    void parsesZoneConfig() {
        assertEquals(2, zones.size());
        assertTrue(zones.get("cuihu_water").editable);
        assertEquals("MY-ECO-CUIHU", zones.get("cuihu_water").areaCode);
        assertFalse(zones.get("central_lawn").editable);
    }

    @Test
    void getIsPublicAndReportsCanEdit() {
        ZoneSpeciesService.Result anon = svc.handle("GET", "/cuihu_water/species", null, zones, null, null);
        assertEquals(200, anon.status);
        assertEquals(Boolean.FALSE, anon.body.get("can_edit"));
        ZoneSpeciesService.Result admin = svc.handle("GET", "/cuihu_water/species", null, zones, "系统管理员", "SYSTEM_ADMIN");
        assertEquals(Boolean.TRUE, admin.body.get("can_edit"));
        ZoneSpeciesService.Result ro = svc.handle("GET", "/central_lawn/species", null, zones, "系统管理员", "SYSTEM_ADMIN");
        assertEquals(Boolean.FALSE, ro.body.get("can_edit"));
    }

    @Test
    void writesRequireLoginAndEditorRole() {
        String body = "{\"species_type\":\"plant\",\"species_key\":\"lotus\",\"species_name\":\"荷花\",\"x\":1.5,\"z\":-2}";
        assertEquals(401, svc.handle("POST", "/cuihu_water/species", body, zones, null, null).status);
        assertEquals(403, svc.handle("POST", "/cuihu_water/species", body, zones, "访客", "VIEWER").status);
        assertEquals(403, svc.handle("POST", "/central_lawn/species", body, zones, "系统管理员", "SYSTEM_ADMIN").status);
        for (String role : new String[]{"SYSTEM_ADMIN", "SUPER_ADMIN", "ADMIN", "PLANT_ADMIN", "MAINTENANCE_ADMIN", "MAINTAINER"}) {
            assertTrue(ZoneSpeciesService.canEdit(role), role);
        }
        assertFalse(ZoneSpeciesService.canEdit(null));
    }

    @Test
    void addMoveDeleteRoundTrip() {
        String body = "{\"species_type\":\"plant\",\"species_key\":\"lotus\",\"species_name\":\"荷花\",\"x\":1.5,\"z\":-2,\"rotation\":0.5,\"scale\":1.1}";
        ZoneSpeciesService.Result created = svc.handle("POST", "/cuihu_water/species", body, zones, "绿植管理员", "PLANT_ADMIN");
        assertEquals(201, created.status);
        Map<String, Object> it = item(created);
        long id = ((Double) it.get("id")).longValue();
        assertEquals("MY-ECO-CUIHU", it.get("area_code"));
        assertEquals("active", it.get("status"));
        assertEquals("绿植管理员", it.get("created_by"));

        ZoneSpeciesService.Result moved = svc.handle("PUT", "/cuihu_water/species/" + id, "{\"x\":-0.8,\"z\":3.25}", zones, "养护管理员", "MAINTENANCE_ADMIN");
        assertEquals(200, moved.status);
        assertEquals(-0.8, (Double) item(moved).get("x"), 1e-9);
        assertEquals("养护管理员", item(moved).get("updated_by"));

        ZoneSpeciesService.Result del = svc.handle("DELETE", "/cuihu_water/species/" + id, null, zones, "养护管理员", "MAINTENANCE_ADMIN");
        assertEquals(200, del.status);
        assertEquals("removed", item(del).get("status"));

        ZoneSpeciesService.Result list = svc.handle("GET", "/cuihu_water/species", null, zones, null, null);
        List<?> items = (List<?>) list.body.get("items");
        assertEquals(1, items.size(), "软删除：记录保留，状态为 removed");
    }

    @Test
    void seedRefIsIdempotent() {
        String b1 = "{\"species_type\":\"plant\",\"species_key\":\"willow\",\"species_name\":\"垂柳\",\"seed_ref\":\"willow#2\",\"x\":5.4,\"z\":-8.7,\"status\":\"removed\"}";
        ZoneSpeciesService.Result r1 = svc.handle("POST", "/cuihu_water/species", b1, zones, "系统管理员", "SYSTEM_ADMIN");
        assertEquals(201, r1.status);
        String b2 = b1.replace("\"removed\"", "\"active\"").replace("5.4", "4.0");
        ZoneSpeciesService.Result r2 = svc.handle("POST", "/cuihu_water/species", b2, zones, "系统管理员", "SYSTEM_ADMIN");
        assertEquals(200, r2.status);
        assertEquals(item(r1).get("id"), item(r2).get("id"));
        assertEquals("active", item(r2).get("status"));
        assertEquals(4.0, (Double) item(r2).get("x"), 1e-9);
        assertEquals(1, ((List<?>) svc.handle("GET", "/cuihu_water/species", null, zones, null, null).body.get("items")).size());
    }

    @Test
    void validatesInput() {
        String admin = "SYSTEM_ADMIN";
        assertEquals(400, svc.handle("POST", "/cuihu_water/species", "{\"species_type\":\"tree\",\"species_key\":\"lotus\",\"species_name\":\"荷花\",\"x\":0,\"z\":0}", zones, "a", admin).status);
        assertEquals(400, svc.handle("POST", "/cuihu_water/species", "{\"species_type\":\"plant\",\"species_key\":\"Lotus!\",\"species_name\":\"荷花\",\"x\":0,\"z\":0}", zones, "a", admin).status);
        assertEquals(400, svc.handle("POST", "/cuihu_water/species", "{\"species_type\":\"plant\",\"species_key\":\"lotus\",\"species_name\":\"荷花\"}", zones, "a", admin).status);
        assertEquals(400, svc.handle("POST", "/cuihu_water/species", "{\"species_type\":\"plant\",\"species_key\":\"lotus\",\"species_name\":\"荷花\",\"x\":\"abc\",\"z\":0}", zones, "a", admin).status);
        assertEquals(400, svc.handle("POST", "/cuihu_water/species", "{\"species_type\":\"plant\",\"species_key\":\"lotus\",\"species_name\":\"荷花\",\"x\":0,\"z\":0,\"scale\":9}", zones, "a", admin).status);
        assertEquals(404, svc.handle("GET", "/nowhere/species", null, zones, null, null).status);
        assertEquals(404, svc.handle("GET", "/cuihu_water/plants", null, zones, null, null).status);
        assertEquals(404, svc.handle("PUT", "/cuihu_water/species/999", "{\"x\":1}", zones, "a", admin).status);
    }

    @Test
    void storeUnavailableGives503() {
        ZoneSpeciesStore down = new ZoneSpeciesStore() {
            private ZoneSpeciesStore.StoreUnavailableException e() { return new ZoneSpeciesStore.StoreUnavailableException("连不上", null); }
            public List<ZoneSpecies> list(String zoneId) throws StoreUnavailableException { throw e(); }
            public ZoneSpecies get(String zoneId, long id) throws StoreUnavailableException { throw e(); }
            public ZoneSpecies findBySeed(String zoneId, String seedRef) throws StoreUnavailableException { throw e(); }
            public ZoneSpecies insert(ZoneSpecies s) throws StoreUnavailableException { throw e(); }
            public ZoneSpecies update(ZoneSpecies s) throws StoreUnavailableException { throw e(); }
        };
        ZoneSpeciesService s2 = new ZoneSpeciesService(down);
        ZoneSpeciesService.Result r = s2.handle("GET", "/cuihu_water/species", null, zones, null, null);
        assertEquals(503, r.status);
        assertEquals("db_unavailable", r.body.get("error"));
    }
}
