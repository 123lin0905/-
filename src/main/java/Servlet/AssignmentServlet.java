package Servlet;

import DB.DBTools;
import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.example.demo1.Maintainer;
import org.example.demo1.Plant;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@WebServlet(name = "AssignmentServlet", value = "/AssignmentServlet")
public class AssignmentServlet extends HttpServlet {
    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        DBTools dbTools = new DBTools();
        List<Maintainer> maintainers = dbTools.queryAllMaintainers(null, null, null);
        List<Plant> plants = dbTools.queryAllPlants();
        Map<Integer, List<Plant>> assignments = new LinkedHashMap<>();
        for (Maintainer maintainer : maintainers) {
            assignments.put(maintainer.getId(), dbTools.queryPlantsByMaintainer(maintainer.getId()));
        }
        request.setAttribute("maintainers", maintainers);
        request.setAttribute("plants", plants);
        request.setAttribute("assignments", assignments);
        request.getRequestDispatcher("assignment.jsp").forward(request, response);
    }

    @Override
    protected void doPost(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        request.setCharacterEncoding("UTF-8");
        String action = request.getParameter("action");
        String maintainerIdText = request.getParameter("maintainerId");
        String pid = request.getParameter("pid");
        try {
            int maintainerId = Integer.parseInt(maintainerIdText);
            DBTools dbTools = new DBTools();
            if ("remove".equals(action)) {
                dbTools.removePlantFromMaintainer(maintainerId, pid);
            } else {
                dbTools.assignPlantToMaintainer(maintainerId, pid, true);
            }
        } catch (Exception e) {
            System.out.println("处理养护员-绿植分配请求失败: " + e.getMessage());
        }
        response.sendRedirect("AssignmentServlet");
    }
}
