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
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

@WebServlet(name = "AddMaintenanceServlet", value = "/AddMaintenanceServlet")
public class AddMaintenanceServlet extends HttpServlet {

    @Override
    protected void doPost(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        request.setCharacterEncoding("UTF-8");
        response.setCharacterEncoding("UTF-8");

        String action = request.getParameter("action");
        String pid = request.getParameter("pid");
        String pname = request.getParameter("pname");
        String mtype = request.getParameter("mtype");
        String mdate = request.getParameter("mdate");
        String operator = request.getParameter("operator");
        String healthStatus = request.getParameter("healthStatus");
        String notes = request.getParameter("notes");

        boolean isAjax = "quickCare".equalsIgnoreCase(action)
                || "json".equalsIgnoreCase(request.getParameter("format"))
                || "XMLHttpRequest".equalsIgnoreCase(request.getHeader("X-Requested-With"));

        DBTools dbTools = new DBTools();

        // 默认类型
        if (mtype == null || mtype.trim().isEmpty()) {
            mtype = "浇水";
        }

        // 若 pname 为空，根据 pid 自动获取绿植名称
        if ((pname == null || pname.trim().isEmpty()) && pid != null) {
            Plant plant = dbTools.queryPlantById(pid);
            if (plant != null) {
                pname = plant.getPname();
            }
        }

        // 默认责任人
        if (operator == null || operator.trim().isEmpty()) {
            operator = "校区责任养护员";
        }

        // 默认健康状态
        if (healthStatus == null || healthStatus.trim().isEmpty()) {
            healthStatus = "状态良好";
        }

        // 默认备注
        if (notes == null || notes.trim().isEmpty()) {
            notes = "完成日常" + mtype + "养护，植株长势健康";
        }

        // 快捷打卡或带周期更新的养护登记
        boolean careSuccess = dbTools.recordPlantCare(pid, mtype, operator, notes);

        if (isAjax) {
            response.setContentType("application/json;charset=UTF-8");
            if (careSuccess) {
                response.getWriter().write("{\"success\":true,\"message\":\"【" + (pname != null ? pname : pid) + "】" + mtype + "打卡成功！已自动更新下一期预警时间。\"}");
            } else {
                response.getWriter().write("{\"success\":false,\"message\":\"养护打卡失败，请检查植物编号是否存在。\"}");
            }
            return;
        }

        // 传统表单跳转回维护主页
        response.sendRedirect("MaintainServlet");
    }

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        doPost(request, response);
    }
}
