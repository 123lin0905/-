package org.example.demo1.mapper;

import org.apache.ibatis.annotations.Param;
import org.example.demo1.Maintainer;

import java.util.List;
import java.util.Map;

public interface MaintainerMapper {
    int insertMaintainer(Maintainer maintainer);

    List<Maintainer> selectAllMaintainers(@Param("keyword") String keyword,
                                         @Param("department") String department,
                                         @Param("status") String status);

    Maintainer selectMaintainerById(@Param("id") int id);

    int updateMaintainer(Maintainer maintainer);

    int deleteMaintainer(@Param("id") int id);

    List<String> selectActiveMaintainerNames();

    int countMaintainers();

    int assignPlantToMaintainer(@Param("maintainerId") int maintainerId,
                               @Param("pid") String pid,
                               @Param("isPrimary") int isPrimary);

    int removePlantFromMaintainer(@Param("maintainerId") int maintainerId,
                                 @Param("pid") String pid);

    int deletePlantMaintainer(@Param("pid") String pid);

    List<Map<String, Object>> selectDirectPlantMaintainers();

    List<Map<String, Object>> selectAreaPlantMaintainers();

    int syncAreaPlantsToMaintainer(@Param("areaId") int areaId,
                                  @Param("maintainerId") int maintainerId);
}
