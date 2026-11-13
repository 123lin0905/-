<%@ page contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" %>
<%@ page import="org.example.demo1.AdminUser, security.Roles" %>
<%
    // 生态动态主页：访客 / 登录后的第一屏（网站入口先是人脸识别窗口 face_login.jsp，见 web.xml）。
    // 本页与 /campus3d/ 静态资源、/api/weather 在 AuthFilter 中为公开访问，不需要登录。
    String ctx = request.getContextPath();
    AdminUser ecoUser = (AdminUser) session.getAttribute("adminUser");
    String ecoUserName = ecoUser == null ? null : ecoUser.getDisplayName();
    if (ecoUserName != null) {
        ecoUserName = ecoUserName.replace("\\", "\\\\").replace("\"", "\\\"").replace("<", "\\u003c").replace(">", "\\u003e");
    }
    // 按身份显示的入口：数据大屏只给管理员，养护工作台只给养护人员，人脸录入给两者；访客只读（服务端 AuthFilter 同样拦截直接访问）
    boolean ecoVisitor = Roles.isVisitor(request);
    String ecoRole = ecoUser == null ? null : ecoUser.getRoleCode();
    String ecoGroup = Roles.group(ecoUser, ecoVisitor);
    StringBuilder ecoLinks = new StringBuilder("[");
    if (Roles.canViewDashboard(ecoRole)) ecoLinks.append("{\"id\":\"nav-dashboard\",\"text\":\"📊 数据大屏\",\"href\":\"").append(ctx).append("/data_screen.jsp\"},");
    if (Roles.canCare(ecoRole)) ecoLinks.append("{\"id\":\"nav-workbench\",\"text\":\"🧑‍🌾 养护工作台\",\"href\":\"").append(ctx).append("/care_workbench.jsp\"},");
    if (Roles.canEnrollFace(ecoRole)) ecoLinks.append("{\"id\":\"nav-face-enroll\",\"text\":\"🙂 人脸录入\",\"href\":\"").append(ctx).append("/face_enroll.jsp\"},");
    if (ecoUser == null) ecoLinks.append("{\"id\":\"nav-face-login\",\"text\":\"🙂 人脸登录\",\"href\":\"").append(ctx).append("/face_login.jsp?switch=1\"},");
    else ecoLinks.append("{\"id\":\"nav-logout\",\"text\":\"退出\",\"href\":\"").append(ctx).append("/LogoutServlet\"},");
    if (ecoLinks.charAt(ecoLinks.length() - 1) == ',') ecoLinks.setLength(ecoLinks.length() - 1);
    ecoLinks.append("]");
%>
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>智慧校园 · 虚拟生态 - 天府学院绵阳校区</title>
  <link rel="stylesheet" href="<%= ctx %>/campus3d/css/ecohome.css" />
</head>
<body>
  <div id="eco-root"></div>
  <script>
    window.ECO_CONFIG = {
      base: "<%= ctx %>/campus3d/",
      weatherApi: "<%= ctx %>/api/weather",
      systemUrl: "<%= ctx %>/index.jsp",
      loginUrl: "<%= ctx %>/login.jsp",
      userName: <%= ecoUserName == null ? "null" : "\"" + ecoUserName + "\"" %>,
      roleGroup: "<%= ecoGroup %>",
      roleLabel: "<%= Roles.groupLabel(ecoGroup) %>",
      navLinks: <%= ecoLinks %>
    };
  </script>
  <script src="<%= ctx %>/campus3d/js/ecohome.js"></script>
</body>
</html>
