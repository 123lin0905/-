package Servlet;

import DB.DBTools;
import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.example.demo1.Plant;
import org.example.demo1.PlantMaintenance;

import java.io.IOException;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

@WebServlet(name = "MaintainServlet", value = "/MaintainServlet")
public class MaintainServlet extends HttpServlet {

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        request.setCharacterEncoding("UTF-8");
        response.setCharacterEncoding("UTF-8");

        String keyword = request.getParameter("keyword");
        String mtype = request.getParameter("mtype");

        DBTools dbTools = new DBTools();

        // 1. 获取所有绿植列表
        List<Plant> plantList = dbTools.queryAllPlants();

        // 2. 获取养护台账流水
        List<PlantMaintenance> maintenanceList = dbTools.queryAllMaintenance(keyword, mtype);

        // 3. 获取每株绿植最新养护记录
        Map<String, PlantMaintenance> lastCareMap = dbTools.getLastMaintenanceMap();

        // 4. 看板指标统计
        String todayStr = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd"));
        int todayCount = dbTools.getTodayMaintenanceCount(todayStr);

        int attentionCount = 0;
        for (Plant plant : plantList) {
            PlantMaintenance last = lastCareMap.get(plant.getPid());
            if (last == null) {
                // 尚未养护过，需要关注
                attentionCount++;
            } else {
                String st = last.getHealthStatus();
                if (st != null && (st.contains("缺水") || st.contains("关注") || st.contains("病害"))) {
                    attentionCount++;
                }
            }
        }

        // 5. 获取在岗维护人员名单供下拉选择
        List<String> maintainerNames = dbTools.queryActiveMaintainerNames();

        // 6. 存入请求域
        request.setAttribute("plantList", plantList);
        request.setAttribute("maintenanceList", maintenanceList);
        request.setAttribute("lastCareMap", lastCareMap);
        request.setAttribute("todayCount", todayCount);
        request.setAttribute("attentionCount", attentionCount);
        request.setAttribute("totalPlants", plantList.size());
        request.setAttribute("maintainerNames", maintainerNames);
        request.setAttribute("keyword", keyword != null ? keyword : "");
        request.setAttribute("mtype", mtype != null ? mtype : "");

        request.getRequestDispatcher("maintain.jsp").forward(request, response);
    }

    @Override
    protected void doPost(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        doGet(request, response);
    }
}
