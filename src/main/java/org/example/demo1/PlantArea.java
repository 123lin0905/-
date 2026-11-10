package org.example.demo1;

public class PlantArea {
    private int id;
    private String areaCode;
    private String areaName;
    private Integer maintainerId;
    private String maintainerName;
    private Double centerLatitude;
    private Double centerLongitude;
    private Integer radiusM;
    private String boundaryJson;
    private String status;
    private int plantCount;

    public int getId() { return id; }
    public void setId(int id) { this.id = id; }
    public String getAreaCode() { return areaCode; }
    public void setAreaCode(String areaCode) { this.areaCode = areaCode; }
    public String getAreaName() { return areaName; }
    public void setAreaName(String areaName) { this.areaName = areaName; }
    public Integer getMaintainerId() { return maintainerId; }
    public void setMaintainerId(Integer maintainerId) { this.maintainerId = maintainerId; }
    public String getMaintainerName() { return maintainerName; }
    public void setMaintainerName(String maintainerName) { this.maintainerName = maintainerName; }
    public Double getCenterLatitude() { return centerLatitude; }
    public void setCenterLatitude(Double centerLatitude) { this.centerLatitude = centerLatitude; }
    public Double getCenterLongitude() { return centerLongitude; }
    public void setCenterLongitude(Double centerLongitude) { this.centerLongitude = centerLongitude; }
    public Integer getRadiusM() { return radiusM; }
    public void setRadiusM(Integer radiusM) { this.radiusM = radiusM; }
    public String getBoundaryJson() { return boundaryJson; }
    public void setBoundaryJson(String boundaryJson) { this.boundaryJson = boundaryJson; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public int getPlantCount() { return plantCount; }
    public void setPlantCount(int plantCount) { this.plantCount = plantCount; }
}
