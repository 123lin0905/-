package Servlet;

import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.annotation.WebFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.example.demo1.AdminUser;

import java.io.IOException;

@WebFilter(filterName = "AuthFilter", urlPatterns = "/*")
public class AuthFilter implements Filter {
    private static final String AUTHENTICATED = "AUTHENTICATED";

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        HttpServletRequest httpRequest = (HttpServletRequest) request;
        HttpServletResponse httpResponse = (HttpServletResponse) response;
        String path = httpRequest.getRequestURI().substring(httpRequest.getContextPath().length());
        String requiredRole = requiredRole(path);

        if (requiredRole == null) {
            chain.doFilter(request, response);
            return;
        }

        AdminUser user = getCurrentUser(httpRequest);
        if (user == null) {
            String returnUrl = path;
            if (httpRequest.getQueryString() != null && !httpRequest.getQueryString().isEmpty()) {
                returnUrl += "?" + httpRequest.getQueryString();
            }
            httpResponse.sendRedirect(httpRequest.getContextPath() + "/login.jsp?returnUrl=" +
                    java.net.URLEncoder.encode(returnUrl, "UTF-8"));
            return;
        }

        if (AUTHENTICATED.equals(requiredRole) || hasRole(user, requiredRole)) {
            chain.doFilter(request, response);
            return;
        }

        httpResponse.setStatus(HttpServletResponse.SC_FORBIDDEN);
        httpResponse.setContentType("text/html;charset=UTF-8");
        renderForbiddenPage(httpRequest, httpResponse, user, requiredRole);
    }

    private String requiredRole(String path) {
        if (path == null || path.isEmpty() || "/".equals(path) || "/index.jsp".equals(path) ||
                "/login.jsp".equals(path) || "/LoginServlet".equals(path) || "/LogoutServlet".equals(path) ||
                "/AiPetServlet".equals(path) || "/plant_detail.jsp".equals(path) ||
                "/ecohome.jsp".equals(path) || "/api/weather".equals(path)) {
            return null;
        }
        // 生态动态主页的三维静态资源（js/css/json/图片/glb 模型）全部公开，未登录也能看到首页大屏；
        // 第二阶段的板块细节场景（如池塘 /campus3d/pond/pond.html）也在此目录下，同样公开
        if (path.startsWith("/campus3d/")) {
            return null;
        }
        if (path.endsWith(".png") || path.endsWith(".jpg") || path.endsWith(".jpeg") ||
                path.endsWith(".gif") || path.endsWith(".css") || path.endsWith(".js") ||
                path.endsWith(".svg") || path.startsWith("/uploads/") || path.startsWith("/greenkeeper/assets/")) {
            return null;
        }
        // 1. 植物管理员专属权限：增添作物、修改作物、更新作物、删除作物（系统管理员不可操作）
        if ("/addplant.jsp".equals(path) || "/editplant.jsp".equals(path) ||
                "/AddPlantServlet".equals(path) || "/EditPlantServlet".equals(path) ||
                "/UpdatePlantServlet".equals(path) || "/DeletePlantServlet".equals(path)) {
            return "PLANT_ADMIN";
        }
        // 2. 养护管理功能
        if ("/maintain.jsp".equals(path) || "/MaintainServlet".equals(path) ||
                "/AddMaintenanceServlet".equals(path) || "/DeleteMaintenanceServlet".equals(path) ||
                "/AssignmentServlet".equals(path) || "/assignment.jsp".equals(path)) {
            return "MAINTENANCE_ADMIN";
        }
        // 3. 系统管理员专属权限：养护员管理、系统后台
        if ("/maintainer.jsp".equals(path) || "/MaintainerServlet".equals(path) ||
                "/AddMaintainerServlet".equals(path) || "/UpdateMaintainerServlet".equals(path) ||
                "/DeleteMaintainerServlet".equals(path) || "/admin.jsp".equals(path) ||
                "/AdminDashboardServlet".equals(path)) {
            return "SYSTEM_ADMIN";
        }
        // 4. 登录即可访问的公共模块：查询绿植、查看全景地图、绿植交互标绘、生态动物、导出等
        if ("/searchplant.jsp".equals(path) || "/QueryServlet".equals(path) ||
                "/animal.jsp".equals(path) || "/AnimalServlet".equals(path) || "/addanimal.jsp".equals(path) ||
                "/map.jsp".equals(path) || "/MapServlet".equals(path) ||
                "/greenkeeper.jsp".equals(path) || "/GreenKeeperServlet".equals(path) ||
                "/AreaServlet".equals(path) || "/area.jsp".equals(path) ||
                "/ExportServlet".equals(path)) {
            return AUTHENTICATED;
        }
        return null;
    }

    private AdminUser getCurrentUser(HttpServletRequest request) {
        Object value = request.getSession(false) == null ? null :
                request.getSession(false).getAttribute("adminUser");
        return value instanceof AdminUser ? (AdminUser) value : null;
    }

    private boolean hasRole(AdminUser user, String requiredRole) {
        if (user == null || user.getRoleCode() == null) {
            return false;
        }
        String role = user.getRoleCode();

        // 核心权限分离规则：
        // 规则 1：植物增删改查业务（PLANT_ADMIN）必须只能由植物管理员执行！
        // 系统管理员（SYSTEM_ADMIN）严格禁止操作作物增添、变动与减少。
        if ("PLANT_ADMIN".equals(requiredRole)) {
            return "PLANT_ADMIN".equals(role);
        }

        // 规则 2：系统管理业务（SYSTEM_ADMIN，如区域管理、人员档案管理）由系统管理员负责。
        // 植物管理员不可越权修改系统人员和区域。
        if ("SYSTEM_ADMIN".equals(requiredRole)) {
            return "SYSTEM_ADMIN".equals(role) || "SUPER_ADMIN".equals(role) || "ADMIN".equals(role);
        }

        // 规则 3：日常养护记录（MAINTENANCE_ADMIN）
        if ("MAINTENANCE_ADMIN".equals(requiredRole)) {
            return "MAINTENANCE_ADMIN".equals(role) || "SYSTEM_ADMIN".equals(role) || "SUPER_ADMIN".equals(role) || "ADMIN".equals(role);
        }

        return requiredRole.equals(role);
    }

    private void renderForbiddenPage(HttpServletRequest request, HttpServletResponse response,
                                    AdminUser user, String requiredRole) throws IOException {
        String roleCode = user != null ? user.getRoleCode() : "未登录";
        String displayName = user != null ? user.getDisplayName() : "访客";
        String tip;
        if ("PLANT_ADMIN".equals(requiredRole)) {
            tip = "<strong>【权限拒绝】</strong>当前功能属于<strong>植物管理员 (PLANT_ADMIN)</strong>专属权限（负责绿植的增添、修改与删除）。<br/>您当前登录的是<strong>" + escape(displayName) + "（" + escape(roleCode) + "）</strong>，系统管理员负责全局系统和人员区域管理，<strong>无权对作物进行增添、修改或删除作业</strong>。";
        } else if ("SYSTEM_ADMIN".equals(requiredRole)) {
            tip = "<strong>【权限拒绝】</strong>当前功能属于<strong>系统管理员 (SYSTEM_ADMIN)</strong>专属权限（负责系统参数、维护人员与网格区域管理）。<br/>您当前登录的是<strong>" + escape(displayName) + "（" + escape(roleCode) + "）</strong>，植物管理员专职负责绿植业务，<strong>无权修改系统人员与区域配置</strong>。";
        } else {
            tip = "<strong>【权限拒绝】</strong>您当前的账号角色为 <strong>" + escape(roleCode) + "</strong>，没有权限访问此功能。";
        }

        StringBuilder html = new StringBuilder();
        html.append("<!DOCTYPE html><html lang='zh-CN'><head><meta charset='UTF-8'>");
        html.append("<meta name='viewport' content='width=device-width, initial-scale=1.0'>");
        html.append("<title>403 权限拒绝 - 智能绿化系统</title>");
        html.append("<style>");
        html.append("body { margin:0; min-height:100vh; display:grid; place-items:center; font-family:'Microsoft YaHei', -apple-system, sans-serif; background:linear-gradient(135deg, #fef2f2, #fff1f2); color:#1f2937; padding:20px; box-sizing:border-box; }");
        html.append(".box { max-width:540px; width:100%; padding:36px; background:#fff; border-radius:20px; box-shadow:0 20px 50px rgba(0,0,0,0.08); border-top:6px solid #ef4444; }");
        html.append("h2 { margin:0 0 16px; font-size:22px; color:#b91c1c; display:flex; align-items:center; gap:8px; }");
        html.append("p { margin:14px 0; font-size:14.5px; line-height:1.7; color:#4b5563; }");
        html.append(".btn-group { margin-top:28px; display:flex; gap:12px; }");
        html.append(".btn { flex:1; padding:11px 18px; border-radius:10px; font-size:14px; text-decoration:none; font-weight:600; text-align:center; transition:all .2s; }");
        html.append(".btn-primary { background:#059669; color:#fff; }");
        html.append(".btn-primary:hover { background:#047857; }");
        html.append(".btn-secondary { background:#f1f5f9; color:#334155; border:1px solid #cbd5e1; }");
        html.append(".btn-secondary:hover { background:#e2e8f0; }");
        html.append("</style></head><body>");
        html.append("<div class='box'>");
        html.append("<h2>🚫 没有权限访问此功能 (403)</h2>");
        html.append("<p>").append(tip).append("</p>");
        html.append("<div class='btn-group'>");
        html.append("<a class='btn btn-primary' href='").append(request.getContextPath()).append("/login.jsp'>切换管理员账号登录</a>");
        html.append("<a class='btn btn-secondary' href='").append(request.getContextPath()).append("/index.jsp'>返回系统首页</a>");
        html.append("</div></div></body></html>");

        response.getWriter().write(html.toString());
    }

    private String escape(String value) {
        if (value == null) return "";
        return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
