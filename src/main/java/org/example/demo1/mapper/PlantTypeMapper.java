package org.example.demo1.mapper;

import org.apache.ibatis.annotations.Param;
import org.example.demo1.PlantType;

import java.util.List;

public interface PlantTypeMapper {
    List<PlantType> selectAllPlantTypes();

    List<PlantType> selectAllFromPlantType();

    int countByTypeOrId(@Param("tid") String tid, @Param("tname") String tname);

    int insertPlantType(@Param("tid") String tid, @Param("tname") String tname, @Param("tdesc") String tdesc);
}
