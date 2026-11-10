package org.example.demo1;

public class PlantMaintenance {
    private int mid;
    private String pid;
    private String pname;
    private String mtype;        // 养护类型：日常浇水 / 施肥补充 / 修剪整形 / 病虫防治 / 松土换盆 / 叶面清洁
    private String mdate;        // 养护日期时间：如 2026-09-20 14:30
    private String operator;     // 养护责任人
    private String healthStatus; // 健康状况：生长旺盛 / 状态良好 / 轻微缺水 / 需关注 / 发现病害
    private String notes;        // 养护备忘与心得

    public PlantMaintenance() {
    }

    public PlantMaintenance(int mid, String pid, String pname, String mtype, String mdate, String operator, String healthStatus, String notes) {
        this.mid = mid;
        this.pid = pid;
        this.pname = pname;
        this.mtype = mtype;
        this.mdate = mdate;
        this.operator = operator;
        this.healthStatus = healthStatus;
        this.notes = notes;
    }

    public PlantMaintenance(String pid, String pname, String mtype, String mdate, String operator, String healthStatus, String notes) {
        this.pid = pid;
        this.pname = pname;
        this.mtype = mtype;
        this.mdate = mdate;
        this.operator = operator;
        this.healthStatus = healthStatus;
        this.notes = notes;
    }

    public int getMid() {
        return mid;
    }

    public void setMid(int mid) {
        this.mid = mid;
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

    public String getMtype() {
        return mtype;
    }

    public void setMtype(String mtype) {
        this.mtype = mtype;
    }

    public String getMdate() {
        return mdate;
    }

    public void setMdate(String mdate) {
        this.mdate = mdate;
    }

    public String getOperator() {
        return operator;
    }

    public void setOperator(String operator) {
        this.operator = operator;
    }

    public String getHealthStatus() {
        return healthStatus;
    }

    public void setHealthStatus(String healthStatus) {
        this.healthStatus = healthStatus;
    }

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }
}
