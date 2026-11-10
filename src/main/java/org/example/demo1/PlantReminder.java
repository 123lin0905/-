package org.example.demo1;

public class PlantReminder {
    private String pid;
    private String plantName;
    private String taskType;
    private String dueDate;
    private String maintainerName;

    public PlantReminder() {
    }

    public PlantReminder(String pid, String plantName, String taskType, String dueDate, String maintainerName) {
        this.pid = pid;
        this.plantName = plantName;
        this.taskType = taskType;
        this.dueDate = dueDate;
        this.maintainerName = maintainerName;
    }

    public String getPid() { return pid; }
    public void setPid(String pid) { this.pid = pid; }
    public String getPlantName() { return plantName; }
    public void setPlantName(String plantName) { this.plantName = plantName; }
    public String getTaskType() { return taskType; }
    public void setTaskType(String taskType) { this.taskType = taskType; }
    public String getDueDate() { return dueDate; }
    public void setDueDate(String dueDate) { this.dueDate = dueDate; }
    public String getMaintainerName() { return maintainerName; }
    public void setMaintainerName(String maintainerName) { this.maintainerName = maintainerName; }
}
