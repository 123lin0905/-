package Servlet;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * 生态主页天气代理：GET /api/weather
 * <p>
 * 由服务器请求 Open-Meteo（免 key）当前天气并缓存 10 分钟，避免每个访客都直连外网，
 * 也方便以后在内网换成学校自己的气象数据源。前端（campus3d/js/eco-weather.js）先请求本接口，
 * 失败再由浏览器直连 Open-Meteo，都失败时使用“虚拟天气”。
 * <p>
 * 返回 Open-Meteo 原始 JSON，并在末尾追加 "cached":true/false 与 "proxy":true 两个字段。
 * 上游不可用且没有缓存时返回 502。
 */
@WebServlet(name = "WeatherServlet", value = "/api/weather")
public class WeatherServlet extends HttpServlet {

    /** 西南财经大学天府学院绵阳校区（绵阳市涪城区园兴西街2号）附近坐标 */
    private static final String UPSTREAM = "https://api.open-meteo.com/v1/forecast"
            + "?latitude=31.493&longitude=104.687"
            + "&current=temperature_2m,weather_code,wind_speed_10m,is_day"
            + "&timezone=Asia%2FShanghai";
    private static final long CACHE_MS = 10L * 60L * 1000L;
    private static final int TIMEOUT_MS = 4000;

    private static final Object LOCK = new Object();
    private static volatile String cachedBody;
    private static volatile long cachedAt;

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response) throws IOException {
        response.setCharacterEncoding("UTF-8");
        response.setContentType("application/json;charset=UTF-8");
        response.setHeader("Cache-Control", "no-store");

        String body;
        boolean fromCache;
        synchronized (LOCK) {
            long now = System.currentTimeMillis();
            if (cachedBody != null && now - cachedAt < CACHE_MS) {
                body = cachedBody;
                fromCache = true;
            } else {
                try {
                    body = fetchUpstream();
                    cachedBody = body;
                    cachedAt = now;
                    fromCache = false;
                } catch (IOException e) {
                    if (cachedBody != null) {
                        // 上游暂时不可用：继续使用旧缓存，前端仍显示“实时（缓存）”
                        body = cachedBody;
                        fromCache = true;
                    } else {
                        response.setStatus(HttpServletResponse.SC_BAD_GATEWAY);
                        response.getWriter().write("{\"error\":\"weather upstream unavailable\",\"proxy\":true}");
                        return;
                    }
                }
            }
        }
        response.getWriter().write(withFlags(body, fromCache));
    }

    private static String withFlags(String json, boolean cached) {
        String trimmed = json.trim();
        if (trimmed.endsWith("}")) {
            return trimmed.substring(0, trimmed.length() - 1) + ",\"cached\":" + cached + ",\"proxy\":true}";
        }
        return trimmed;
    }

    private static String fetchUpstream() throws IOException {
        HttpURLConnection conn = (HttpURLConnection) new URL(UPSTREAM).openConnection();
        conn.setConnectTimeout(TIMEOUT_MS);
        conn.setReadTimeout(TIMEOUT_MS);
        conn.setRequestProperty("Accept", "application/json");
        conn.setRequestProperty("User-Agent", "TianfuCampusEcoHome/1.0");
        try {
            int code = conn.getResponseCode();
            if (code != 200) {
                throw new IOException("Open-Meteo HTTP " + code);
            }
            try (InputStream in = conn.getInputStream()) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[4096];
                int n;
                while ((n = in.read(buf)) != -1) {
                    out.write(buf, 0, n);
                }
                String body = new String(out.toByteArray(), StandardCharsets.UTF_8);
                if (!body.contains("\"current\"")) {
                    throw new IOException("Open-Meteo 返回内容缺少 current 字段");
                }
                return body;
            }
        } finally {
            conn.disconnect();
        }
    }
}
