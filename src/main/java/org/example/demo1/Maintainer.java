package org.example.demo1;

public class Maintainer {
    private int id;              // 自增主键
    private String staffNo;      // 工号（如 WH-1001）
    private String name;         // 姓名（如 张师傅）
    private String gender;       // 性别（男/女）
    private String phone;        // 联系电话
    private String department;   // 所属班组/部门（如 户外乔木班）
    private String duty;         // 职务/岗位（如 高级园艺师）
    private String status;       // 状态（在岗 / 轮休 / 请假）
    private String entryDate;    // 入职日期（如 2024-03-15）
    private String remark;       // 技能专长与备忘

    public Maintainer() {
    }

    public Maintainer(int id, String staffNo, String name, String gender, String phone, String department, String duty, String status, String entryDate, String remark) {
        this.id = id;
        this.staffNo = staffNo;
        this.name = name;
        this.gender = gender;
        this.phone = phone;
        this.department = department;
        this.duty = duty;
        this.status = status;
        this.entryDate = entryDate;
        this.remark = remark;
    }

    public Maintainer(String staffNo, String name, String gender, String phone, String department, String duty, String status, String entryDate, String remark) {
        this.staffNo = staffNo;
        this.name = name;
        this.gender = gender;
        this.phone = phone;
        this.department = department;
        this.duty = duty;
        this.status = status;
        this.entryDate = entryDate;
        this.remark = remark;
    }

    public int getId() {
        return id;
    }

    public void setId(int id) {
        this.id = id;
    }

    public String getStaffNo() {
        return staffNo;
    }

    public void setStaffNo(String staffNo) {
        this.staffNo = staffNo;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getGender() {
        return gender;
    }

    public void setGender(String gender) {
        this.gender = gender;
    }

    public String getPhone() {
        return phone;
    }

    public void setPhone(String phone) {
        this.phone = phone;
    }

    public String getDepartment() {
        return department;
    }

    public void setDepartment(String department) {
        this.department = department;
    }

    public String getDuty() {
        return duty;
    }

    public void setDuty(String duty) {
        this.duty = duty;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getEntryDate() {
        return entryDate;
    }

    public void setEntryDate(String entryDate) {
        this.entryDate = entryDate;
    }

    public String getRemark() {
        return remark;
    }

    public void setRemark(String remark) {
        this.remark = remark;
    }
}
