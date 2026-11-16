package org.example.demo1.mapper;

import org.example.demo1.PlantMaintenance;

/** 原养护台账 plant_maintenance：养护工作台给绿植记养护时同步写一条，便于与历史台账衔接。 */
public interface PlantMaintenanceMapper {
    int insertMaintenance(PlantMaintenance maintenance);
}
