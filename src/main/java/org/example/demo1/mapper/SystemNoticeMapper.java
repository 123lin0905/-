package org.example.demo1.mapper;

import org.apache.ibatis.annotations.Param;
import org.example.demo1.SystemNotice;

import java.util.List;

public interface SystemNoticeMapper {
    List<SystemNotice> selectRecentNotices(@Param("limit") int limit);

    List<SystemNotice> selectAllNotices();

    int countNotices();

    int insertNotice(SystemNotice notice);

    int updateNotice(SystemNotice notice);

    int deleteNotice(@Param("id") int id);
}
