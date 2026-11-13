package Servlet;

import DB.DBTools;
import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.example.demo1.AdminUser;
import security.SecurityUtils;

import java.io.IOException;

@WebServlet(name = "LoginServlet", value = "/LoginServlet")
public class LoginServlet extends HttpServlet {
    @Override
    protected void doPost(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        request.setCharacterEncoding("UTF-8");
        response.setCharacterEncoding("UTF-8");

        String username = request.getParameter("username");
        String password = request.getParameter("password");
        String returnUrl = safeReturnUrl(request.getParameter("returnUrl"));

        DBTools dbTools = new DBTools();
        AdminUser adminUser = dbTools.authenticateAdmin(
                username == null ? "" : username.trim(),
                SecurityUtils.sha256(password == null ? "" : password)
        );

        if (adminUser == null) {
            request.setAttribute("error", "账号、密码错误或账号已停用");
            request.setAttribute("returnUrl", returnUrl);
            request.getRequestDispatcher("login.jsp").forward(request, response);
            return;
        }

        // 换会话 id（防会话固定），清掉访客标记，写入账号（与人脸登录共用 security.Roles.signIn）
        security.Roles.signIn(request, adminUser, "password");
        // 遵循用户明确要求：登录后一律直接跳转到系统主页 index.jsp；
        // 唯一例外：从人脸识别窗口“先登录再录入人脸”过来的（returnUrl=/face_enroll.jsp），登录后直接去录入页
        if ("/face_enroll.jsp".equals(returnUrl) && security.Roles.canEnrollFace(adminUser.getRoleCode())) {
            response.sendRedirect(request.getContextPath() + "/face_enroll.jsp");
            return;
        }
        response.sendRedirect(request.getContextPath() + "/index.jsp");
    }

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        request.getRequestDispatcher("login.jsp").forward(request, response);
    }

    private String safeReturnUrl(String value) {
        if (value == null || value.trim().isEmpty()) return "/AdminDashboardServlet";
        String candidate = value.trim();
        if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.contains("\\")) {
            return "/AdminDashboardServlet";
        }
        return candidate;
    }
}
