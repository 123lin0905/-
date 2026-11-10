package Servlet;

import DB.DBTools;
import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.example.demo1.AdminUser;
import org.example.demo1.SystemNotice;

import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;

@WebServlet(name = "AdminDashboardServlet", value = "/AdminDashboardServlet")
public class AdminDashboardServlet extends HttpServlet {

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        request.setCharacterEncoding("UTF-8");
        response.setCharacterEncoding("UTF-8");

        DBTools dbTools = new DBTools();

        List<AdminUser> userList = dbTools.queryAllAdminUsers();
        List<SystemNotice> noticeList = dbTools.queryAllNotices();

        int plantCount = dbTools.getPlantCount();
        int maintainerCount = dbTools.getMaintainerCount();
        int maintenanceCount = dbTools.getMaintenanceCount();
        int duePlantCount = dbTools.getDuePlantCount();

        request.setAttribute("userList", userList);
        request.setAttribute("noticeList", noticeList);
        request.setAttribute("plantCount", plantCount);
        request.setAttribute("maintainerCount", maintainerCount);
        request.setAttribute("maintenanceCount", maintenanceCount);
        request.setAttribute("duePlantCount", duePlantCount);

        request.getRequestDispatcher("admin.jsp").forward(request, response);
    }

    @Override
    protected void doPost(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        request.setCharacterEncoding("UTF-8");
        response.setCharacterEncoding("UTF-8");

        String action = request.getParameter("action");
        DBTools dbTools = new DBTools();

        if ("addUser".equalsIgnoreCase(action)) {
            String username = request.getParameter("username");
            String plainPassword = request.getParameter("plainPassword");
            String displayName = request.getParameter("displayName");
            String roleCode = request.getParameter("roleCode");
            dbTools.addAdminUser(username, plainPassword, displayName, roleCode);
        } else if ("updatePassword".equalsIgnoreCase(action)) {
            String idStr = request.getParameter("id");
            String newPassword = request.getParameter("newPassword");
            if (idStr != null && newPassword != null && !newPassword.trim().isEmpty()) {
                try {
                    dbTools.updateAdminUserPassword(Integer.parseInt(idStr.trim()), newPassword.trim());
                } catch (Exception ignored) {}
            }
        } else if ("toggleUserStatus".equalsIgnoreCase(action)) {
            String idStr = request.getParameter("id");
            String statusStr = request.getParameter("status");
            if (idStr != null && statusStr != null) {
                try {
                    dbTools.toggleAdminUserStatus(Integer.parseInt(idStr.trim()), Integer.parseInt(statusStr.trim()));
                } catch (Exception ignored) {}
            }
        } else if ("deleteUser".equalsIgnoreCase(action)) {
            String idStr = request.getParameter("id");
            if (idStr != null) {
                try {
                    dbTools.deleteAdminUser(Integer.parseInt(idStr.trim()));
                } catch (Exception ignored) {}
            }
        } else if ("addNotice".equalsIgnoreCase(action)) {
            String title = request.getParameter("title");
            String content = request.getParameter("content");
            String category = request.getParameter("category");
            String publisher = request.getParameter("publisher");
            String priority = request.getParameter("priority");
            String publishDate = request.getParameter("publishDate");
            String status = request.getParameter("status");

            if (publisher == null || publisher.trim().isEmpty()) publisher = "绿化管理中心";
            if (priority == null || priority.trim().isEmpty()) priority = "普通";
            if (publishDate == null || publishDate.trim().isEmpty()) {
                publishDate = new SimpleDateFormat("yyyy-MM-dd").format(new Date());
            }
            if (status == null || status.trim().isEmpty()) status = "发布";

            SystemNotice notice = new SystemNotice(0, title, content, category, publisher, priority, publishDate, status);
            dbTools.addNotice(notice);
        } else if ("deleteNotice".equalsIgnoreCase(action)) {
            String idStr = request.getParameter("id");
            if (idStr != null) {
                try {
                    dbTools.deleteNotice(Integer.parseInt(idStr.trim()));
                } catch (Exception ignored) {}
            }
        }

        response.sendRedirect("AdminDashboardServlet");
    }
}
