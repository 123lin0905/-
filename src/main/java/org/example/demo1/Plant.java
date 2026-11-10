package org.example.demo1;

public class Plant {
    private String pid;
    private String pname;
    private String ptype;
    private String pdatetime;
    private int pprice;
    private String ppic;
    private String pdesc;
    private Integer areaId;
    private Double latitude;
    private Double longitude;
    private Integer trimPeriodDays;
    private Integer fertilizePeriodDays;
    private Integer waterPeriodDays;
    private Integer pestPeriodDays;
    private String nextTrimDate;
    private String nextFertilizeDate;
    private String nextWaterDate;
    private String nextPestDate;

    public Plant() {
    }

    public Plant(String pid, String pname, String ptype, String pdatetime, int pprice, String ppic, String pdesc) {
        this.pid = pid;
        this.pname = pname;
        this.ptype = ptype;
        this.pdatetime = pdatetime;
        this.pprice = pprice;
        this.ppic = ppic;
        this.pdesc = pdesc;
    }

    public String getPid() {
        return pid;
    }

    public void setPid(String pid) {
        this.pid = pid;
    }

    public String getPname() {
        return pname;
    }

    public void setPname(String pname) {
        this.pname = pname;
    }

    public String getPtype() {
        return ptype;
    }

    public void setPtype(String ptype) {
        this.ptype = ptype;
    }

    public String getPdatetime() {
        return pdatetime;
    }

    public void setPdatetime(String pdatetime) {
        this.pdatetime = pdatetime;
    }

    public int getPprice() {
        return pprice;
    }

    public void setPprice(int pprice) {
        this.pprice = pprice;
    }

    public String getPpic() {
        return ppic;
    }

    public void setPpic(String ppic) {
        this.ppic = ppic;
    }

    public String getPdesc() {
        return pdesc;
    }

    public void setPdesc(String pdesc) {
        this.pdesc = pdesc;
    }

    public Integer getAreaId() {
        return areaId;
    }

    public void setAreaId(Integer areaId) {
        this.areaId = areaId;
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

    public Integer getTrimPeriodDays() {
        return trimPeriodDays;
    }

    public void setTrimPeriodDays(Integer trimPeriodDays) {
        this.trimPeriodDays = trimPeriodDays;
    }

    public Integer getFertilizePeriodDays() {
        return fertilizePeriodDays;
    }

    public void setFertilizePeriodDays(Integer fertilizePeriodDays) {
        this.fertilizePeriodDays = fertilizePeriodDays;
    }

    public Integer getWaterPeriodDays() {
        return waterPeriodDays;
    }

    public void setWaterPeriodDays(Integer waterPeriodDays) {
        this.waterPeriodDays = waterPeriodDays;
    }

    public Integer getPestPeriodDays() {
        return pestPeriodDays;
    }

    public void setPestPeriodDays(Integer pestPeriodDays) {
        this.pestPeriodDays = pestPeriodDays;
    }

    public String getNextTrimDate() {
        return nextTrimDate;
    }

    public void setNextTrimDate(String nextTrimDate) {
        this.nextTrimDate = nextTrimDate;
    }

    public String getNextFertilizeDate() {
        return nextFertilizeDate;
    }

    public void setNextFertilizeDate(String nextFertilizeDate) {
        this.nextFertilizeDate = nextFertilizeDate;
    }

    public String getNextWaterDate() {
        return nextWaterDate;
    }

    public void setNextWaterDate(String nextWaterDate) {
        this.nextWaterDate = nextWaterDate;
    }

    public String getNextPestDate() {
        return nextPestDate;
    }

    public void setNextPestDate(String nextPestDate) {
        this.nextPestDate = nextPestDate;
    }
}
