package org.example.demo1.mapper;

import org.apache.ibatis.annotations.Param;
import org.example.demo1.PlantMaintenance;

import java.util.List;

public interface PlantMaintenanceMapper {
    int insertMaintenance(PlantMaintenance maintenance);

    List<PlantMaintenance> selectAllMaintenance(@Param("keyword") String keyword, @Param("mtype") String mtype);

    int deleteMaintenance(@Param("mid") int mid);

    List<PlantMaintenance> selectAllOrderAsc();

    int countTodayMaintenance(@Param("todayPrefix") String todayPrefix);

    List<PlantMaintenance> selectMaintenanceByPid(@Param("pid") String pid);

    List<PlantMaintenance> selectRecentMaintenance(@Param("limit") int limit);
}
