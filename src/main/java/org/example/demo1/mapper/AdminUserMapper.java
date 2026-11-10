package org.example.demo1.mapper;

import org.apache.ibatis.annotations.Param;
import org.example.demo1.AdminUser;

import java.util.List;

public interface AdminUserMapper {
    AdminUser authenticateAdmin(@Param("username") String username,
                                @Param("hashes") List<String> hashes);

    int insertAdminUser(AdminUser adminUser);

    List<AdminUser> selectAllUsers();

    int updateUserPassword(@Param("id") int id, @Param("passwordHash") String passwordHash);

    int updateUserStatus(@Param("id") int id, @Param("status") int status);

    int deleteUser(@Param("id") int id);
}
