<%@ page contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" %>
<%@ page import="org.example.demo1.AdminUser" %>
<%
    // 生态动态主页：网站打开后的第一屏（web.xml welcome-file 指向本页）。
    // 本页与 /campus3d/ 静态资源、/api/weather 在 AuthFilter 中为公开访问，不需要登录。
    String ctx = request.getContextPath();
    AdminUser ecoUser = (AdminUser) session.getAttribute("adminUser");
    String ecoUserName = ecoUser == null ? null : ecoUser.getDisplayName();
    if (ecoUserName != null) {
        ecoUserName = ecoUserName.replace("\\", "\\\\").replace("\"", "\\\"").replace("<", "\\u003c").replace(">", "\\u003e");
    }
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
      userName: <%= ecoUserName == null ? "null" : "\"" + ecoUserName + "\"" %>
    };
  </script>
  <script src="<%= ctx %>/campus3d/js/ecohome.js"></script>
</body>
</html>
