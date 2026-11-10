package Servlet;

import DB.DBTools;
import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.example.demo1.Plant;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.List;

@WebServlet(name = "Campus3dProxyServlet", value = "/Campus3dProxy")
public class Campus3dProxyServlet extends HttpServlet {
    private static final String TARGET_URL = "https://pc.energy.showtimer.cn/school/base?eciCode=stsh_xHrwVZhF";

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        response.setContentType("text/html;charset=UTF-8");
        response.setHeader("Access-Control-Allow-Origin", "*");

        StringBuilder htmlBuilder = new StringBuilder();
        try {
            URL url = new URL(TARGET_URL);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
            conn.setRequestProperty("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(15000);

            try (BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    htmlBuilder.append(line).append("\n");
                }
            }
        } catch (Exception e) {
            response.getWriter().write("<div style='color:white;background:#0f172a;padding:30px;font-family:sans-serif;'><h3>3D 校园服务连接失败</h3><p>" + e.getMessage() + "</p></div>");
            return;
        }

        String html = htmlBuilder.toString();

        // 1. 注入 <base href> 确保所有引用的静态资源（Vue/Cesium/图片）能正常从 showtimer 加载
        html = html.replaceFirst("(?i)<head>", "<head>\n  <base href=\"https://pc.energy.showtimer.cn/\">\n");

        // 2. 从本地数据库获取当前绿植数据
        DBTools dbTools = new DBTools();
        List<Plant> plantList = dbTools.queryAllPlants();
        StringBuilder plantJson = new StringBuilder("[");
        if (plantList != null) {
            for (int i = 0; i < plantList.size(); i++) {
                Plant p = plantList.get(i);
                String landmark = "时代广场";
                String areaDesc = "时代广场中庭核心植被区";
                if (p.getPname().contains("第一")) {
                    landmark = "时代广场";
                    areaDesc = "时代广场中庭核心植被区";
                } else if (p.getPname().contains("第二")) {
                    landmark = "康养护理学院";
                    areaDesc = "康养生命科学馆庭院林荫道";
                } else if (p.getPname().contains("第三")) {
                    landmark = "学术报告厅";
                    areaDesc = "学术报告厅与图书馆后林";
                } else if (i == 3) {
                    landmark = "艺术设计学院";
                    areaDesc = "艺术设计学院南草坪";
                } else if (i == 4) {
                    landmark = "正校门鸟瞰";
                    areaDesc = "正校门迎宾大道绿化带";
                } else {
                    landmark = "运动场";
                    areaDesc = "田径运动场周边绿化带";
                }

                if (i > 0) plantJson.append(",");
                plantJson.append("{")
                        .append("\"pid\":\"").append(escape(p.getPid())).append("\",")
                        .append("\"name\":\"").append(escape(p.getPname())).append("\",")
                        .append("\"type\":\"").append(escape(p.getPtype() == null ? "银杏" : p.getPtype())).append("\",")
                        .append("\"landmark\":\"").append(escape(landmark)).append("\",")
                        .append("\"area\":\"").append(escape(areaDesc)).append("\",")
                        .append("\"water\":\"").append(escape(p.getNextWaterDate() == null ? "定期施水" : p.getNextWaterDate())).append("\",")
                        .append("\"trim\":\"").append(escape(p.getNextTrimDate() == null ? "按季修剪" : p.getNextTrimDate())).append("\"")
                        .append("}");
            }
        }
        plantJson.append("]");

        // 3. 注入植入 3D 模型内部的绿植脚本与样式（与 3D 地标节点 100% 绑定）
        String injection = "\n<style>\n" +
                "  .tf-plant-badge {\n" +
                "    display: inline-flex !important;\n" +
                "    align-items: center;\n" +
                "    gap: 4px;\n" +
                "    background: linear-gradient(135deg, #059669, #10b981) !important;\n" +
                "    color: #ffffff !important;\n" +
                "    font-size: 11.5px !important;\n" +
                "    font-weight: 700 !important;\n" +
                "    padding: 3px 8px !important;\n" +
                "    border-radius: 12px !important;\n" +
                "    box-shadow: 0 4px 12px rgba(5, 150, 105, 0.6), 0 0 0 1.5px #ffffff !important;\n" +
                "    margin-bottom: 4px !important;\n" +
                "    cursor: pointer !important;\n" +
                "    pointer-events: auto !important;\n" +
                "    white-space: nowrap !important;\n" +
                "    animation: plantPulse 2s infinite ease-in-out;\n" +
                "  }\n" +
                "  .tf-plant-badge:hover {\n" +
                "    transform: scale(1.15);\n" +
                "    background: linear-gradient(135deg, #047857, #059669) !important;\n" +
                "  }\n" +
                "  @keyframes plantPulse {\n" +
                "    0%, 100% { box-shadow: 0 4px 12px rgba(5, 150, 105, 0.6), 0 0 0 1.5px #ffffff; }\n" +
                "    50% { box-shadow: 0 4px 18px rgba(16, 185, 129, 0.9), 0 0 0 2.5px #34d399; }\n" +
                "  }\n" +
                "</style>\n" +
                "<script>\n" +
                "  (function() {\n" +
                "    const myPlants = " + plantJson.toString() + ";\n" +
                "    console.log('[Campus3D] 3D 绿植注入引擎启动，植物列表:', myPlants);\n" +
                "    \n" +
                "    function attachPlantBadges() {\n" +
                "      const allElements = document.querySelectorAll('*');\n" +
                "      myPlants.forEach(plant => {\n" +
                "        // 查找与地标匹配的 3D DOM 节点\n" +
                "        for (let i = 0; i < allElements.length; i++) {\n" +
                "          const el = allElements[i];\n" +
                "          if (el.children.length === 0 && el.textContent && el.textContent.trim() === plant.landmark) {\n" +
                "            const parentCard = el.closest('div');\n" +
                "            if (parentCard && !parentCard.querySelector('.tf-plant-badge[data-pid=\"' + plant.pid + '\"]')) {\n" +
                "              const badge = document.createElement('div');\n" +
                "              badge.className = 'tf-plant-badge';\n" +
                "              badge.setAttribute('data-pid', plant.pid);\n" +
                "              badge.innerHTML = '<span>🌿</span><span>' + plant.name + '</span>';\n" +
                "              badge.onclick = function(e) {\n" +
                "                e.stopPropagation();\n" +
                "                if (window.parent) {\n" +
                "                  window.parent.postMessage({ type: 'PLANT_DETAIL', plant: plant }, '*');\n" +
                "                }\n" +
                "              };\n" +
                "              parentCard.insertBefore(badge, parentCard.firstChild);\n" +
                "              console.log('[Campus3D] 成功将绿植 ' + plant.name + ' 钉在 3D 建筑：' + plant.landmark);\n" +
                "            }\n" +
                "          }\n" +
                "        }\n" +
                "      });\n" +
                "    }\n" +
                "    \n" +
                "    // 定时轮询与观察 3D 场景动态生成的节点\n" +
                "    setInterval(attachPlantBadges, 800);\n" +
                "    window.addEventListener('load', attachPlantBadges);\n" +
                "  })();\n" +
                "</script>\n";

        html = html.replaceFirst("(?i)</body>", injection + "\n</body>");
        response.getWriter().write(html);
    }

    private String escape(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "").replace("\r", "");
    }
}
