package DB;

import org.example.demo1.ZoneSpecies;

import java.util.List;

/**
 * 板块动植物个体的存取接口。正式环境用 {@link JdbcZoneSpeciesStore}（MySQL 表 zone_species），
 * 单元测试 / 演示用 {@link MemoryZoneSpeciesStore}。数据库不可用时抛 {@link StoreUnavailableException}，接口返回 503，
 * 前端据此切换到 localStorage 演示模式。
 */
public interface ZoneSpeciesStore {
    List<ZoneSpecies> list(String zoneId) throws StoreUnavailableException;
    ZoneSpecies get(String zoneId, long id) throws StoreUnavailableException;
    ZoneSpecies findBySeed(String zoneId, String seedRef) throws StoreUnavailableException;
    ZoneSpecies insert(ZoneSpecies s) throws StoreUnavailableException;
    ZoneSpecies update(ZoneSpecies s) throws StoreUnavailableException;

    class StoreUnavailableException extends Exception {
        public StoreUnavailableException(String msg, Throwable cause) { super(msg, cause); }
    }
}
