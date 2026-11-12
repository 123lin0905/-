package org.example.demo1;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 生态板块内的一个动植物“个体”（三维场景里的一株荷花、一棵垂柳、一条锦鲤……），对应表 zone_species。
 * seedRef 不为空：场景原有个体（如 willow#2），记录的是对它的移植 / 移除；为空：管理员后来新增的个体。
 */
public class ZoneSpecies {
    private Long id;
    private String zoneId;          // zones.json 的板块 id，如 cuihu_water
    private String areaCode;        // 对应 plant_area.area_code，如 MY-ECO-CUIHU
    private String speciesType;     // plant / animal
    private String speciesKey;      // 物种目录 key，如 lotus / koi
    private String speciesName;     // 中文名
    private String seedRef;         // 场景原有个体编号；新增个体为 null
    private int quantity = 1;
    private double x, z, rotation, scale = 1;
    private String status = "active";   // active / removed
    private String createdBy, updatedBy, createdAt, updatedAt;

    public Map<String, Object> toMap() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", id); m.put("zone_id", zoneId); m.put("area_code", areaCode);
        m.put("species_type", speciesType); m.put("species_key", speciesKey); m.put("species_name", speciesName);
        m.put("seed_ref", seedRef); m.put("quantity", quantity);
        m.put("x", x); m.put("z", z); m.put("rotation", rotation); m.put("scale", scale);
        m.put("status", status); m.put("created_by", createdBy); m.put("created_at", createdAt);
        m.put("updated_by", updatedBy); m.put("updated_at", updatedAt);
        return m;
    }

    public ZoneSpecies copy() {
        ZoneSpecies c = new ZoneSpecies();
        c.id = id; c.zoneId = zoneId; c.areaCode = areaCode; c.speciesType = speciesType; c.speciesKey = speciesKey; c.speciesName = speciesName;
        c.seedRef = seedRef; c.quantity = quantity; c.x = x; c.z = z; c.rotation = rotation; c.scale = scale; c.status = status;
        c.createdBy = createdBy; c.updatedBy = updatedBy; c.createdAt = createdAt; c.updatedAt = updatedAt;
        return c;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getZoneId() { return zoneId; }
    public void setZoneId(String zoneId) { this.zoneId = zoneId; }
    public String getAreaCode() { return areaCode; }
    public void setAreaCode(String areaCode) { this.areaCode = areaCode; }
    public String getSpeciesType() { return speciesType; }
    public void setSpeciesType(String speciesType) { this.speciesType = speciesType; }
    public String getSpeciesKey() { return speciesKey; }
    public void setSpeciesKey(String speciesKey) { this.speciesKey = speciesKey; }
    public String getSpeciesName() { return speciesName; }
    public void setSpeciesName(String speciesName) { this.speciesName = speciesName; }
    public String getSeedRef() { return seedRef; }
    public void setSeedRef(String seedRef) { this.seedRef = seedRef; }
    public int getQuantity() { return quantity; }
    public void setQuantity(int quantity) { this.quantity = quantity; }
    public double getX() { return x; }
    public void setX(double x) { this.x = x; }
    public double getZ() { return z; }
    public void setZ(double z) { this.z = z; }
    public double getRotation() { return rotation; }
    public void setRotation(double rotation) { this.rotation = rotation; }
    public double getScale() { return scale; }
    public void setScale(double scale) { this.scale = scale; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }
    public String getUpdatedBy() { return updatedBy; }
    public void setUpdatedBy(String updatedBy) { this.updatedBy = updatedBy; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
    public String getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(String updatedAt) { this.updatedAt = updatedAt; }
}
