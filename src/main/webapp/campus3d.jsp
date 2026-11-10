<%@ page contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" %>
<%@ page import="java.io.*, java.net.*, java.nio.charset.StandardCharsets, java.util.List, DB.DBTools, org.example.demo1.Plant" %>
<%
    String targetUrl = "https://pc.energy.showtimer.cn/school/base?eciCode=stsh_xHrwVZhF";
    StringBuilder htmlBuilder = new StringBuilder();
    try {
        URL url = new URL(targetUrl);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("GET");
        conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
        conn.setRequestProperty("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
        conn.setConnectTimeout(8000);
        conn.setReadTimeout(12000);

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                htmlBuilder.append(line).append("\n");
            }
        }
    } catch (Exception e) {
        // 网络异常时直接无缝重定向至官网 3D 直链，保证 100% 能看
        out.write("<!DOCTYPE html><html><head><meta charset='UTF-8'><script>window.location.replace('" + targetUrl + "');</script></head><body>3D校园连接中...</body></html>");
        return;
    }

    String html = htmlBuilder.toString();

    // 1. 将所有相对资源路径重写为官网绝对域名路径（不用 <base href>，避免破坏 replaceState 的同源性）
    html = html.replace("src=\"/static/", "src=\"https://pc.energy.showtimer.cn/static/");
    html = html.replace("href=\"/static/", "href=\"https://pc.energy.showtimer.cn/static/");
    html = html.replace("src=\"/", "src=\"https://pc.energy.showtimer.cn/");
    html = html.replace("href=\"/", "href=\"https://pc.energy.showtimer.cn/");

    // 2. 在 <head> 首行执行同源 replaceState，将页面路径伪装为 /school/base?eciCode=stsh_xHrwVZhF
    // 此时因为没有跨域 <base> 标签干扰，replaceState 在 localhost:8080 作用域下 100% 成功，Vue Router 不会触发 404！
    String headPrepend = "<head>\n" +
            "  <script>\n" +
            "    try {\n" +
            "      window.history.replaceState(null, '', '/school/base?eciCode=stsh_xHrwVZhF');\n" +
            "    } catch(e) {\n" +
            "      console.warn('[Campus3D] replaceState:', e);\n" +
            "    }\n" +
            "  </script>\n";
    html = html.replaceFirst("(?i)<head>", headPrepend);

    // 3. 从数据库读取所有植物信息，并绑定对应的西财天府 3D 建筑地标
    DBTools dbTools = new DBTools();
    List<Plant> plantList = dbTools.queryAllPlants();
    StringBuilder plantJson = new StringBuilder("[");
    if (plantList != null) {
        for (int i = 0; i < plantList.size(); i++) {
            Plant p = plantList.get(i);
            String landmark = "时代广场";
            String areaDesc = "时代广场中庭核心植被区";
            if (p.getPname() != null && p.getPname().contains("第一")) {
                landmark = "时代广场";
                areaDesc = "时代广场中庭核心植被区";
            } else if (p.getPname() != null && p.getPname().contains("第二")) {
                landmark = "康养护理学院";
                areaDesc = "康养生命科学馆庭院林荫道";
            } else if (p.getPname() != null && p.getPname().contains("第三")) {
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
            String safePid = p.getPid() == null ? "" : p.getPid().replace("\\", "\\\\").replace("\"", "\\\"");
            String safeName = p.getPname() == null ? "" : p.getPname().replace("\\", "\\\\").replace("\"", "\\\"");
            String safeType = p.getPtype() == null ? "银杏" : p.getPtype().replace("\\", "\\\\").replace("\"", "\\\"");
            String safeWater = p.getNextWaterDate() == null ? "定期施水" : p.getNextWaterDate().replace("\\", "\\\\").replace("\"", "\\\"");
            String safeTrim = p.getNextTrimDate() == null ? "按季修剪" : p.getNextTrimDate().replace("\\", "\\\\").replace("\"", "\\\"");

            plantJson.append("{")
                    .append("\"pid\":\"").append(safePid).append("\",")
                    .append("\"name\":\"").append(safeName).append("\",")
                    .append("\"landmark\":\"").append(landmark).append("\",")
                    .append("\"area\":\"").append(areaDesc).append("\",")
                    .append("\"type\":\"").append(safeType).append("\",")
                    .append("\"water\":\"").append(safeWater).append("\",")
                    .append("\"trim\":\"").append(safeTrim).append("\"")
                    .append("}");
        }
    }
    plantJson.append("]");

    // 4. 注入植入 3D Cesium 内部地标卡片的绿植图钉（随 3D 缩放/旋转/平移完全锁定）
    String injection = "\n<!-- 西财天府 3D 绿植点位注入模块 -->\n" +
            "<style>\n" +
            "  .tf-plant-badge {\n" +
            "    display: inline-flex !important;\n" +
            "    align-items: center !important;\n" +
            "    gap: 4px !important;\n" +
            "    background: linear-gradient(135deg, #059669, #10b981) !important;\n" +
            "    color: #ffffff !important;\n" +
            "    font-size: 11.5px !important;\n" +
            "    font-weight: 700 !important;\n" +
            "    padding: 3px 9px !important;\n" +
            "    border-radius: 14px !important;\n" +
            "    box-shadow: 0 4px 14px rgba(5, 150, 105, 0.75), 0 0 0 1.5px #ffffff !important;\n" +
            "    margin-bottom: 5px !important;\n" +
            "    cursor: pointer !important;\n" +
            "    pointer-events: auto !important;\n" +
            "    white-space: nowrap !important;\n" +
            "    z-index: 99999 !important;\n" +
            "    transition: transform 0.2s ease, box-shadow 0.2s ease !important;\n" +
            "    animation: badgePulse 2.4s infinite ease-in-out !important;\n" +
            "  }\n" +
            "  .tf-plant-badge:hover {\n" +
            "    transform: scale(1.16) translateY(-2px) !important;\n" +
            "    background: linear-gradient(135deg, #047857, #059669) !important;\n" +
            "    box-shadow: 0 6px 20px rgba(5, 150, 105, 0.95), 0 0 0 2px #ffffff !important;\n" +
            "  }\n" +
            "  @keyframes badgePulse {\n" +
            "    0%, 100% { box-shadow: 0 4px 14px rgba(5, 150, 105, 0.75), 0 0 0 1.5px #ffffff; }\n" +
            "    50% { box-shadow: 0 4px 20px rgba(16, 185, 129, 0.95), 0 0 0 2.5px #6ee7b7; }\n" +
            "  }\n" +
            "</style>\n" +
            "<script>\n" +
            "  (function() {\n" +
            "    const plantConfigs = " + plantJson.toString() + ";\n" +
            "    console.log('[Campus3D] 3D 作物标记注入初始化，植株数:', plantConfigs.length);\n" +
            "\n" +
            "    function bindPlantsTo3D() {\n" +
            "      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);\n" +
            "      let node;\n" +
            "      while ((node = walker.nextNode())) {\n" +
            "        const val = node.nodeValue ? node.nodeValue.trim() : '';\n" +
            "        if (!val || val.length > 20) continue;\n" +
            "        for (let i = 0; i < plantConfigs.length; i++) {\n" +
            "          const plant = plantConfigs[i];\n" +
            "          if (val === plant.landmark || (val.length <= plant.landmark.length + 3 && val.indexOf(plant.landmark) !== -1)) {\n" +
            "            const parent = node.parentElement;\n" +
            "            if (!parent || parent.classList.contains('tf-plant-badge')) continue;\n" +
            "            const card = parent.closest('.vc-overlay-html') || parent.closest('.vc-entity') || parent.closest('div');\n" +
            "            if (card && !card.querySelector('.tf-plant-badge[data-pid=\"' + plant.pid + '\"]')) {\n" +
            "              card.style.overflow = 'visible';\n" +
            "              const badge = document.createElement('div');\n" +
            "              badge.className = 'tf-plant-badge';\n" +
            "              badge.setAttribute('data-pid', plant.pid);\n" +
            "              badge.innerHTML = '<span>🌿</span><span>' + plant.name + '</span>';\n" +
            "              badge.title = '【' + plant.name + '】点击查看养护档案';\n" +
            "              badge.onclick = function(e) {\n" +
            "                e.stopPropagation();\n" +
            "                e.preventDefault();\n" +
            "                if (window.parent) {\n" +
            "                  window.parent.postMessage({ type: 'PLANT_DETAIL', plant: plant }, '*');\n" +
            "                }\n" +
            "              };\n" +
            "              card.insertBefore(badge, card.firstChild);\n" +
            "            }\n" +
            "          }\n" +
            "        }\n" +
            "      }\n" +
            "    }\n" +
            "\n" +
            "    if (window.MutationObserver) {\n" +
            "      const observer = new MutationObserver(bindPlantsTo3D);\n" +
            "      observer.observe(document.documentElement, { childList: true, subtree: true });\n" +
            "    }\n" +
            "    setInterval(bindPlantsTo3D, 500);\n" +
            "    window.addEventListener('load', bindPlantsTo3D);\n" +
            "  })();\n" +
            "</script>\n";

    html = html.replaceFirst("(?i)</body>", injection + "\n</body>");
    out.write(html);
%>
