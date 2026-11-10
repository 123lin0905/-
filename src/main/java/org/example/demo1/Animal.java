package org.example.demo1;

import java.io.Serializable;

/**
 * 校园生态动物作物实体类
 * 涵盖西南财经大学天府学院伴生生态与人工饲护动物（如黑天鹅、锦鲤、孔雀、松鼠等）
 */
public class Animal implements Serializable {
    private static final long serialVersionUID = 1L;

    private Integer id;
    private String animalNo;          // 动物档案编号，如 AN-1001
    private String name;              // 动物名称，如 "天府黑天鹅"
    private String species;           // 学名/科属，如 "Cygnus atratus"
    private String category;          // 类别：水禽鸟类、观赏鱼类、林栖哺乳类、陆禽鸟类、两栖类
    private Integer count;            // 数量（只/尾/群），默认 1
    private Integer areaId;           // 栖息/网格区域 ID
    private String areaName;          // 区域名称，如 "天府湖水域生态区"
    private Double latitude;          // 经纬度：纬度
    private Double longitude;         // 经纬度：经度
    private String healthStatus;      // 健康状况：健康活泼、生长良好、重点观察、隔离照料
    private String dietType;          // 食性与饲料类型，如 "专用禽粮/水草"
    private Integer feedingCycleDays; // 投喂/照料周期（天），默认 1
    private String nextFeedingDate;   // 下次投喂/巡护日期 (YYYY-MM-DD)
    private String keeperName;        // 专职保育员/责任人姓名
    private String birthDate;         // 引入/出生日期 (YYYY-MM-DD)
    private String picUrl;            // 动物图样/照片地址
    private String remark;            // 档案备注与习性说明

    public Animal() {
        this.count = 1;
        this.category = "水禽鸟类";
        this.healthStatus = "健康活泼";
        this.feedingCycleDays = 1;
    }

    public Animal(String animalNo, String name, String species, String category, Integer count,
                  Integer areaId, String areaName, Double latitude, Double longitude,
                  String healthStatus, String dietType,
                  Integer feedingCycleDays, String nextFeedingDate, String keeperName,
                  String birthDate, String picUrl, String remark) {
        this.animalNo = animalNo;
        this.name = name;
        this.species = species;
        this.category = category;
        this.count = count;
        this.areaId = areaId;
        this.areaName = areaName;
        this.latitude = latitude;
        this.longitude = longitude;
        this.healthStatus = healthStatus;
        this.dietType = dietType;
        this.feedingCycleDays = feedingCycleDays;
        this.nextFeedingDate = nextFeedingDate;
        this.keeperName = keeperName;
        this.birthDate = birthDate;
        this.picUrl = picUrl;
        this.remark = remark;
    }

    public Animal(String animalNo, String name, String species, String category, Integer count,
                  Integer areaId, String areaName, String healthStatus, String dietType,
                  Integer feedingCycleDays, String nextFeedingDate, String keeperName,
                  String birthDate, String picUrl, String remark) {
        this(animalNo, name, species, category, count, areaId, areaName, null, null,
                healthStatus, dietType, feedingCycleDays, nextFeedingDate, keeperName, birthDate, picUrl, remark);
    }

    public Integer getId() {
        return id;
    }

    public void setId(Integer id) {
        this.id = id;
    }

    public String getAnimalNo() {
        return animalNo;
    }

    public void setAnimalNo(String animalNo) {
        this.animalNo = animalNo;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getSpecies() {
        return species;
    }

    public void setSpecies(String species) {
        this.species = species;
    }

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    public Integer getCount() {
        return count != null ? count : 1;
    }

    public void setCount(Integer count) {
        this.count = count;
    }

    public Integer getAreaId() {
        return areaId;
    }

    public void setAreaId(Integer areaId) {
        this.areaId = areaId;
    }

    public String getAreaName() {
        return areaName;
    }

    public void setAreaName(String areaName) {
        this.areaName = areaName;
    }

    public Double getLatitude() {
        return latitude;
    }

    public void setLatitude(Double latitude) {
        this.latitude = latitude;
    }

    public Double getLongitude() {
        return longitude;
    }

    public void setLongitude(Double longitude) {
        this.longitude = longitude;
    }

    public String getHealthStatus() {
        return healthStatus != null ? healthStatus : "健康活泼";
    }

    public void setHealthStatus(String healthStatus) {
        this.healthStatus = healthStatus;
    }

    public String getDietType() {
        return dietType;
    }

    public void setDietType(String dietType) {
        this.dietType = dietType;
    }

    public Integer getFeedingCycleDays() {
        return feedingCycleDays != null ? feedingCycleDays : 1;
    }

    public void setFeedingCycleDays(Integer feedingCycleDays) {
        this.feedingCycleDays = feedingCycleDays;
    }

    public String getNextFeedingDate() {
        return nextFeedingDate;
    }

    public void setNextFeedingDate(String nextFeedingDate) {
        this.nextFeedingDate = nextFeedingDate;
    }

    public String getKeeperName() {
        return keeperName != null ? keeperName : "生态保育员";
    }

    public void setKeeperName(String keeperName) {
        this.keeperName = keeperName;
    }

    public String getBirthDate() {
        return birthDate;
    }

    public void setBirthDate(String birthDate) {
        this.birthDate = birthDate;
    }

    public String getPicUrl() {
        return picUrl;
    }

    public void setPicUrl(String picUrl) {
        this.picUrl = picUrl;
    }

    public String getRemark() {
        return remark;
    }

    public void setRemark(String remark) {
        this.remark = remark;
    }
}
