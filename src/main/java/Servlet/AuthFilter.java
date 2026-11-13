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
import security.Roles;

import java.io.IOException;
import java.util.Set;

@WebFilter(filterName = "AuthFilter", urlPatterns = "/*")
public class AuthFilter implements Filter {
    private static final String AUTHENTICATED = "AUTHENTICATED";

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        HttpServletRequest httpRequest = (HttpServletRequest) request;
        HttpServletResponse httpResponse = (HttpServletResponse) response;
        String path = httpRequest.getRequestURI().substring(httpRequest.getContextPath().length());
        boolean visitor = Roles.isVisitor(httpRequest);
        // 人脸登录新增的按身份页面 / 接口：数据大屏（管理员）、养护工作台（养护人员）、人脸录入（管理员 + 养护人员）。
        // 未登录：接口 401 / 页面跳登录；访客或角色不符：403。入口按身份在导航中显示，这里保证直接访问 URL 也被拦截。
        Set<String> gate = roleGate(path);
        if (gate != null) {
            AdminUser gateUser = getCurrentUser(httpRequest);
            boolean api = path.startsWith("/api/");
            if (gateUser != null && gate.contains(gateUser.getRoleCode())) {
                chain.doFilter(request, response);
                return;
            }
            if (gateUser == null && !visitor) {
                if (api) {
                    writeJson(httpResponse, HttpServletResponse.SC_UNAUTHORIZED, "{\"error\":\"login_required\",\"message\":\"请先登录\"}");
                } else {
                    httpResponse.sendRedirect(httpRequest.getContextPath() + "/login.jsp?returnUrl=" + java.net.URLEncoder.encode(path, "UTF-8"));
                }
                return;
            }
            String who = gateUser == null ? "访客（只读）" : gateUser.getRoleCode();
            if (api) {
                writeJson(httpResponse, HttpServletResponse.SC_FORBIDDEN, "{\"error\":\"forbidden\",\"message\":\"当前身份 " + who + " 无权访问\"}");
            } else {
                httpResponse.setStatus(HttpServletResponse.SC_FORBIDDEN);
                httpResponse.setContentType("text/html;charset=UTF-8");
                renderForbiddenPage(httpRequest, httpResponse, gateUser, gateTip(path));
            }
            return;
        }
        // 生态板块动植物增删接口：GET 公开；增 / 改 / 删需登录且为管理员或养护员（ZoneSpeciesService.EDITOR_ROLES）。
        // 接口调用方是三维场景里的 fetch，所以未登录 / 无权限时返回 JSON 401 / 403，而不是跳转登录页。
        if (path.startsWith("/api/zones/")) {
            String method = httpRequest.getMethod();
            if (!"GET".equals(method) && !"HEAD".equals(method) && !"OPTIONS".equals(method)) {
                AdminUser zoneUser = getCurrentUser(httpRequest);
                if (zoneUser == null || !ZoneSpeciesService.canEdit(zoneUser.getRoleCode())) {
                    // 未登录 401；访客（只读）与无编辑权限的角色 403
                    boolean anonymous = zoneUser == null && !visitor;
                    httpResponse.setStatus(anonymous ? HttpServletResponse.SC_UNAUTHORIZED : HttpServletResponse.SC_FORBIDDEN);
                    httpResponse.setContentType("application/json;charset=UTF-8");
                    httpResponse.getWriter().write(anonymous
                            ? "{\"error\":\"login_required\",\"message\":\"请先登录（管理员或养护员）再增删动植物\"}"
                            : zoneUser == null
                            ? "{\"error\":\"forbidden\",\"message\":\"访客只能浏览，不能增删动植物\"}"
                            : "{\"error\":\"forbidden\",\"message\":\"当前角色无权增删动植物，仅管理员 / 养护员可以操作\"}");
                    return;
                }
            }
            chain.doFilter(request, response);
            return;
        }
        String requiredRole = requiredRole(path);

        if (requiredRole == null) {
            chain.doFilter(request, response);
            return;
        }

        AdminUser user = getCurrentUser(httpRequest);
        if (user == null && visitor) {
            // 访客（人脸窗口选择“先不录入 / 以访客进入”）只读：后台功能页一律 403
            httpResponse.setStatus(HttpServletResponse.SC_FORBIDDEN);
            httpResponse.setContentType("text/html;charset=UTF-8");
            renderForbiddenPage(httpRequest, httpResponse, null, requiredRole);
            return;
        }
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

    /** 按身份开放的新页面 / 接口；null 表示不归这里管。 */
    static Set<String> roleGate(String path) {
        if ("/care_workbench.jsp".equals(path) || "/api/care".equals(path) || path.startsWith("/api/care/")) return Roles.CARE_ROLES;
        if ("/data_screen.jsp".equals(path) || "/api/dashboard".equals(path) || path.startsWith("/api/dashboard/")) return Roles.ADMIN_ROLES;
        if ("/face_enroll.jsp".equals(path)) return Roles.FACE_ROLES;
        return null;
    }

    private static String gateTip(String path) {
        if (path.contains("care")) return "TIP:养护工作台仅<strong>养护人员 (MAINTAINER)</strong>登录后可用（浇水、施肥、喂食）。";
        if (path.contains("dashboard") || path.contains("data_screen")) return "TIP:数据大屏仅<strong>管理员</strong>登录后可以打开。";
        return "TIP:人脸录入仅<strong>管理员 / 养护人员</strong>用账号密码登录后才能给自己录入；访客不需要录入人脸。";
    }

    private static void writeJson(HttpServletResponse resp, int status, String json) throws IOException {
        resp.setStatus(status);
        resp.setContentType("application/json;charset=UTF-8");
        resp.setHeader("Cache-Control", "no-store");
        resp.getWriter().write(json);
    }

    private String requiredRole(String path) {
        if (path == null || path.isEmpty() || "/".equals(path) || "/index.jsp".equals(path) ||
                "/face_login.jsp".equals(path) || "/api/me".equals(path) || path.startsWith("/api/face/") ||
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
        String roleCode = user != null ? user.getRoleCode() : "访客·只读";
        String displayName = user != null ? user.getDisplayName() : "访客";
        String tip;
        if (requiredRole != null && requiredRole.startsWith("TIP:")) {
            tip = "<strong>【权限拒绝】</strong>" + requiredRole.substring(4) + "<br/>您当前是<strong>" + escape(displayName) + "（" + escape(roleCode) + "）</strong>。";
        } else if (user == null) {
            tip = "<strong>【权限拒绝】</strong>您正以<strong>访客</strong>身份浏览，只能查看生态主页等公开页面，不能进入后台或改动任何数据。如需操作，请登录管理员 / 养护员账号。";
        } else if ("PLANT_ADMIN".equals(requiredRole)) {
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
        html.append("<a class='btn btn-primary' href='").append(request.getContextPath()).append("/face_login.jsp?switch=1'>人脸 / 账号登录</a>");
        html.append("<a class='btn btn-secondary' href='").append(request.getContextPath()).append("/index.jsp'>返回系统首页</a>");
        html.append("</div></div></body></html>");

        response.getWriter().write(html.toString());
    }

    private String escape(String value) {
        if (value == null) return "";
        return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
