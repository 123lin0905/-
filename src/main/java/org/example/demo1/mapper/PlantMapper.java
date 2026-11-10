package org.example.demo1.mapper;

import org.apache.ibatis.annotations.Param;
import org.example.demo1.Plant;
import org.example.demo1.PlantReminder;

import java.util.List;

public interface PlantMapper {
    int insertPlant(Plant plant);

    List<Plant> selectAllPlants();

    Plant selectPlantById(@Param("pid") String pid);

    int updatePlant(Plant plant);

    int updatePlantLocation(@Param("pid") String pid,
                           @Param("latitude") Double latitude,
                           @Param("longitude") Double longitude,
                           @Param("areaId") Integer areaId);

    int updatePlantCareDate(@Param("pid") String pid,
                           @Param("dateCol") String dateCol,
                           @Param("nextDate") String nextDate);

    int deletePlant(@Param("pid") String pid);

    int countPlants();

    int countDuePlants();

    int countUnassignedPlants();

    List<Plant> selectPlantsByMaintainer(@Param("maintainerId") int maintainerId);

    List<PlantReminder> selectPlantReminders(@Param("daysAhead") int daysAhead);
}
