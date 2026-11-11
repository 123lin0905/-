package Servlet;

import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletContext;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.annotation.WebFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.net.URLConnection;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.zip.GZIPOutputStream;

/**
 * 三维生态静态资源（/campus3d/*）的缓存头与 gzip 压缩。
 * <p>
 * 不改 Tomcat server.xml / conf/web.xml：本 Filter 直接读取 webapp 内的文件，
 * 对文本类资源（js/css/html/json/svg）按 Accept-Encoding 返回 gzip（压缩结果按“路径 + 修改时间”缓存在内存，只压一次），
 * 并按资源类型设置 Cache-Control：
 * <ul>
 *   <li>带 ?v=版本号 的资源（由 tools/build_pond.py 按内容哈希生成，如 pond-main.js?v=1a2b3c4d）：一年 + immutable；</li>
 *   <li>/campus3d/lib/ 下的第三方库（文件名带版本，如 three-r160.min.js）：30 天；</li>
 *   <li>模型 / 图片：7 天；</li>
 *   <li>其他（页面、未带版本的脚本、数据 json）：no-cache，每次用 ETag 协商（未修改时 304，几乎不耗流量）。</li>
 * </ul>
 * 非 GET/HEAD、找不到文件或二进制资源时交给 Tomcat 默认 Servlet 处理（仍带上缓存头）。
 */
@WebFilter(filterName = "StaticAssetFilter", urlPatterns = "/campus3d/*")
public class StaticAssetFilter implements Filter {
    private static final long YEAR = 365L * 24 * 3600, MONTH = 30L * 24 * 3600, WEEK = 7L * 24 * 3600;
    private static final int MAX_CACHED_BYTES = 4 * 1024 * 1024;   // 单个文件超过 4MB 不在内存里缓存压缩结果
    private static final Map<String, Entry> CACHE = new ConcurrentHashMap<>();

    private static final class Entry {
        final long lastModified; final byte[] gzip; final int rawLength; final String etag;
        Entry(long lastModified, byte[] gzip, int rawLength, String etag) { this.lastModified = lastModified; this.gzip = gzip; this.rawLength = rawLength; this.etag = etag; }
    }

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain) throws IOException, ServletException {
        HttpServletRequest req = (HttpServletRequest) request;
        HttpServletResponse resp = (HttpServletResponse) response;
        String path = req.getRequestURI().substring(req.getContextPath().length());
        String method = req.getMethod();
        if (!"GET".equals(method) && !"HEAD".equals(method)) { chain.doFilter(request, response); return; }
        if (path.endsWith("/")) path += "index.html";
        String lower = path.toLowerCase(Locale.ROOT);
        resp.setHeader("Cache-Control", cacheControl(lower, req.getQueryString()));
        String type = textType(lower);
        String ae = req.getHeader("Accept-Encoding");
        boolean gzipOk = ae != null && ae.toLowerCase(Locale.ROOT).contains("gzip");
        if (type == null || !gzipOk) { chain.doFilter(request, response); return; }

        ServletContext ctx = req.getServletContext();
        URL url = ctx.getResource(path);
        if (url == null) { chain.doFilter(request, response); return; }
        long lm;
        URLConnection conn = url.openConnection();
        lm = conn.getLastModified();
        Entry e = CACHE.get(path);
        if (e == null || e.lastModified != lm) {
            byte[] raw;
            try (InputStream in = conn.getInputStream()) { raw = readAll(in); }
            ByteArrayOutputStream bo = new ByteArrayOutputStream(Math.max(1024, raw.length / 3));
            try (GZIPOutputStream gz = new GZIPOutputStream(bo)) { gz.write(raw); }
            e = new Entry(lm, bo.toByteArray(), raw.length, "W/\"" + raw.length + "-" + lm + "-gz\"");
            if (raw.length <= MAX_CACHED_BYTES) CACHE.put(path, e);
        }
        resp.setHeader("Vary", "Accept-Encoding");
        resp.setHeader("ETag", e.etag);
        resp.setDateHeader("Last-Modified", lm);
        String inm = req.getHeader("If-None-Match");
        if (inm != null && inm.contains(e.etag)) { resp.setStatus(HttpServletResponse.SC_NOT_MODIFIED); return; }
        resp.setContentType(type);
        resp.setHeader("Content-Encoding", "gzip");
        resp.setHeader("X-Raw-Length", String.valueOf(e.rawLength));   // 解压后大小：主页预取进度条用（真实字节进度）
        resp.setContentLength(e.gzip.length);
        if ("HEAD".equals(method)) return;
        resp.getOutputStream().write(e.gzip);
    }

    static String cacheControl(String lowerPath, String query) {
        if (query != null && query.matches("(^|.*&)v=[0-9a-zA-Z]+(&.*|$)")) return "public, max-age=" + YEAR + ", immutable";
        if (lowerPath.startsWith("/campus3d/lib/")) return "public, max-age=" + MONTH;
        if (lowerPath.endsWith(".glb") || lowerPath.endsWith(".jpg") || lowerPath.endsWith(".png") || lowerPath.endsWith(".webp")) return "public, max-age=" + WEEK;
        return "no-cache";
    }

    static String textType(String lowerPath) {
        if (lowerPath.endsWith(".js")) return "text/javascript;charset=UTF-8";
        if (lowerPath.endsWith(".css")) return "text/css;charset=UTF-8";
        if (lowerPath.endsWith(".html")) return "text/html;charset=UTF-8";
        if (lowerPath.endsWith(".json")) return "application/json;charset=UTF-8";
        if (lowerPath.endsWith(".svg")) return "image/svg+xml";
        if (lowerPath.endsWith(".txt")) return "text/plain;charset=UTF-8";
        return null;
    }

    private static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream bo = new ByteArrayOutputStream(64 * 1024);
        byte[] buf = new byte[64 * 1024];
        int n;
        while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
        return bo.toByteArray();
    }
}
