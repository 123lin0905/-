<%@ page contentType="text/plain; charset=UTF-8" %>
<%@ page import="java.net.*, java.util.Map, java.util.List" %>
<%
    URL url = new URL("https://pc.energy.showtimer.cn/static/js/index-3b98bd46.js");
    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
    conn.setRequestMethod("GET");
    conn.setRequestProperty("Origin", "http://localhost:8080");
    conn.connect();
    out.println("Status: " + conn.getResponseCode());
    for (Map.Entry<String, List<String>> entry : conn.getHeaderFields().entrySet()) {
        out.println(entry.getKey() + ": " + entry.getValue());
    }
%>
