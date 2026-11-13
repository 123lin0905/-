package Servlet;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.example.demo1.AdminUser;
import security.Roles;

import java.io.IOException;

/**
 * GET /api/me：当前身份与能力（公开，不查库）。三维场景（静态 html）据此决定“管理动植物”按钮是否显示。
 * {user:{…group: admin / maintainer / visitor / anonymous}, can_edit_species, can_care, can_dashboard, can_enroll_face}
 */
@WebServlet(name = "MeServlet", value = "/api/me")
public class MeServlet extends HttpServlet {
    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        AdminUser u = Roles.currentUser(req);
        boolean visitor = Roles.isVisitor(req);
        String role = u == null ? null : u.getRoleCode();
        ApiSupport.json(resp, 200, ApiSupport.obj(
                "user", ApiSupport.userJson(u, visitor),
                "can_edit_species", ZoneSpeciesService.canEdit(role),
                "can_care", Roles.canCare(role),
                "can_dashboard", Roles.canViewDashboard(role),
                "can_enroll_face", Roles.canEnrollFace(role)));
    }
}
