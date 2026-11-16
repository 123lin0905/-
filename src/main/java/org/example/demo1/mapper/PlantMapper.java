package org.example.demo1.mapper;

import org.apache.ibatis.annotations.Param;
import org.example.demo1.Plant;

/** 绿植档案（plant 表）：养护工作台给绿植记一次养护时读取周期、更新下次养护日期。 */
public interface PlantMapper {
    Plant selectPlantById(@Param("pid") String pid);

    int updatePlantCareDate(@Param("pid") String pid,
                           @Param("dateCol") String dateCol,
                           @Param("nextDate") String nextDate);
}
