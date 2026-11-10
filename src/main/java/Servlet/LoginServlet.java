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

        request.getSession(true).setAttribute("adminUser", adminUser);
        // 遵循用户明确要求：登录后一律直接跳转到系统主页 index.jsp
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
