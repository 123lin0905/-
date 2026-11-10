package org.example.demo1.mapper;

import org.apache.ibatis.annotations.Param;
import org.example.demo1.PlantArea;

import java.util.List;

public interface PlantAreaMapper {
    List<PlantArea> selectAllAreas();

    PlantArea selectAreaByCode(@Param("areaCode") String areaCode);

    PlantArea selectAreaById(@Param("id") int id);

    int insertOrUpdateArea(PlantArea area);

    int updateArea(PlantArea area);

    int clearAreaPlants(@Param("areaId") int areaId);

    int deleteArea(@Param("id") int id);
}
