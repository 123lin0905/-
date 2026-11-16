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

/**
 * 全站访问控制（系统只保留三维生态 + 人脸登录这一套页面）：
 * <ul>
 *   <li>公开：人脸识别窗口 face_login.jsp（含账号密码登录）、生态主页 ecohome.jsp、/campus3d/ 静态资源与各生态板块场景、
 *       /face/ 前端资源、/api/me、/api/face/*（具体权限由 FaceServlet 再校验）、/api/auth/login、/api/weather、/api/zones 的 GET；</li>
 *   <li>按身份：见 {@link #roleGate}（数据大屏、养护工作台、人脸录入、人脸信息管理、账号管理）；</li>
 *   <li>/api/zones 的增删改：管理员或养护员（{@link ZoneSpeciesService#canEdit}）。</li>
 * </ul>
 * 未登录访问按身份页面 → 跳到 face_login.jsp?switch=1&amp;mode=password&amp;returnUrl=…（直接打开账号密码登录）；接口返回 JSON 401。
 * 访客或角色不符 → 403（页面为 403 提示页，接口为 JSON）。
 */
@WebFilter(filterName = "AuthFilter", urlPatterns = "/*")
public class AuthFilter implements Filter {
    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        HttpServletRequest httpRequest = (HttpServletRequest) request;
        HttpServletResponse httpResponse = (HttpServletResponse) response;
        String path = httpRequest.getRequestURI().substring(httpRequest.getContextPath().length());
        boolean visitor = Roles.isVisitor(httpRequest);
        // 人脸登录新增的按身份页面 / 接口：数据大屏（管理员）、养护工作台（养护人员）、人脸录入（管理员 + 养护人员）、人脸信息管理（管理员）。
        // 未登录：接口 401 / 页面跳登录；访客或角色不符：403。入口按身份在导航中显示，这里保证直接访问 URL 也被拦截。
        Set<String> gate = roleGate(path);
        if (gate != null) {
            AdminUser gateUser = Roles.currentUser(httpRequest);
            boolean api = path.startsWith("/api/");
            if (gateUser != null && gate.contains(gateUser.getRoleCode())) {
                chain.doFilter(request, response);
                return;
            }
            if (gateUser == null && !visitor) {
                if (api) {
                    writeJson(httpResponse, HttpServletResponse.SC_UNAUTHORIZED, "{\"error\":\"login_required\",\"message\":\"请先登录\"}");
                } else {
                    httpResponse.sendRedirect(loginUrl(httpRequest, path));
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
                AdminUser zoneUser = Roles.currentUser(httpRequest);
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
        chain.doFilter(request, response);
    }

    /** 未登录时的登录地址：人脸识别窗口直接切到账号密码登录，登录后回到原页面（AuthServlet 只接受站内相对路径）。 */
    static String loginUrl(HttpServletRequest req, String path) throws java.io.UnsupportedEncodingException {
        String returnUrl = path;
        if (req.getQueryString() != null && !req.getQueryString().isEmpty()) returnUrl += "?" + req.getQueryString();
        return req.getContextPath() + "/face_login.jsp?switch=1&mode=password&returnUrl=" + java.net.URLEncoder.encode(returnUrl, "UTF-8");
    }

    /** 按身份开放的页面 / 接口；null 表示公开（不归这里管）。 */
    public static Set<String> roleGate(String path) {
        if (path == null) return null;
        // 账号管理（仅系统级管理员）：页面 + 接口
        if ("/account_admin.jsp".equals(path) || "/api/accounts".equals(path) || path.startsWith("/api/accounts/")) return Roles.ACCOUNT_ADMIN_ROLES;
        if ("/care_workbench.jsp".equals(path) || "/api/care".equals(path) || path.startsWith("/api/care/")) return Roles.CARE_ROLES;
        if ("/data_screen.jsp".equals(path) || "/api/dashboard".equals(path) || path.startsWith("/api/dashboard/")) return Roles.ADMIN_ROLES;
        if ("/face_enroll.jsp".equals(path)) return Roles.FACE_ROLES;
        // 人脸信息管理（仅管理员）：页面 + 管理接口；具体能管哪些账号由 FaceServlet 按 Roles.canManageFaceOf 再校验
        if ("/face_admin.jsp".equals(path) || "/api/face/accounts".equals(path) || path.startsWith("/api/face/accounts/")) return Roles.ADMIN_ROLES;
        return null;
    }

    private static String gateTip(String path) {
        if (path.contains("account")) return "TIP:账号管理仅<strong>系统管理员</strong>（SYSTEM_ADMIN / SUPER_ADMIN / ADMIN）登录后可用。";
        if (path.contains("care")) return "TIP:养护工作台仅<strong>养护人员 (MAINTAINER)</strong>登录后可用（浇水、施肥、喂食）。";
        if (path.contains("dashboard") || path.contains("data_screen")) return "TIP:数据大屏仅<strong>管理员</strong>登录后可以打开。";
        if (path.contains("face_admin") || path.startsWith("/api/face/accounts")) return "TIP:人脸信息管理仅<strong>管理员</strong>登录后可用；养护人员的人脸录入后长期保存，如需更换请联系管理员。";
        return "TIP:人脸录入仅<strong>管理员 / 养护人员</strong>用账号密码登录后才能给自己录入；访客不需要录入人脸。";
    }

    private static void writeJson(HttpServletResponse resp, int status, String json) throws IOException {
        resp.setStatus(status);
        resp.setContentType("application/json;charset=UTF-8");
        resp.setHeader("Cache-Control", "no-store");
        resp.getWriter().write(json);
    }

    private void renderForbiddenPage(HttpServletRequest request, HttpServletResponse response,
                                    AdminUser user, String requiredRole) throws IOException {
        String roleCode = user != null ? user.getRoleCode() : "访客·只读";
        String displayName = user != null ? user.getDisplayName() : "访客";
        String tip;
        if (requiredRole != null && requiredRole.startsWith("TIP:")) {
            tip = "<strong>【权限拒绝】</strong>" + requiredRole.substring(4) + "<br/>您当前是<strong>" + escape(displayName) + "（" + escape(roleCode) + "）</strong>。";
        } else if (user == null) {
            tip = "<strong>【权限拒绝】</strong>您正以<strong>访客</strong>身份浏览，只能查看生态主页等公开页面，不能改动任何数据。如需操作，请登录管理员 / 养护员账号。";
        } else {
            tip = "<strong>【权限拒绝】</strong>您当前的账号角色为 <strong>" + escape(roleCode) + "</strong>，没有权限访问此功能。";
        }
        String ctx = request.getContextPath();
        StringBuilder html = new StringBuilder();
        html.append("<!DOCTYPE html><html lang='zh-CN'><head><meta charset='UTF-8'>");
        html.append("<meta name='viewport' content='width=device-width, initial-scale=1.0'>");
        html.append("<title>403 权限拒绝 · 智慧校园虚拟生态</title>");
        html.append("<link rel='stylesheet' href='").append(ctx).append("/console/console.css'>");
        html.append("</head><body><div class='fl-wrap'><main class='fl-card ec-glass' style='text-align:left'>");
        html.append("<h1 style='color:#fecaca'>🚫 没有权限访问此功能 (403)</h1>");
        html.append("<p class='fl-state' style='font-size:14.5px'>").append(tip).append("</p>");
        html.append("<div class='fl-actions'>");
        html.append("<a class='ec-btn ec-btn-primary' href='").append(ctx).append("/face_login.jsp?switch=1'>人脸 / 账号登录</a>");
        html.append("<a class='ec-btn' href='").append(ctx).append("/ecohome.jsp'>返回生态主页</a>");
        html.append("</div></main></div></body></html>");

        response.getWriter().write(html.toString());
    }

    private String escape(String value) {
        if (value == null) return "";
        return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
