package Servlet;

import DB.DBTools;
import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.example.demo1.Maintainer;

import java.io.IOException;
import java.util.*;

@WebServlet(name = "MaintainerServlet", value = "/MaintainerServlet")
public class MaintainerServlet extends HttpServlet {

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        request.setCharacterEncoding("UTF-8");
        response.setCharacterEncoding("UTF-8");

        String keyword = request.getParameter("keyword");
        String department = request.getParameter("department");
        String status = request.getParameter("status");

        DBTools dbTools = new DBTools();

        // 1. 查询全部（用于统计）与按条件过滤的列表
        List<Maintainer> allList = dbTools.queryAllMaintainers(null, null, null);
        List<Maintainer> maintainerList = dbTools.queryAllMaintainers(keyword, department, status);

        // 2. 统计指标
        int totalCount = allList.size();
        int onDutyCount = 0;
        int restingCount = 0;
        int leaveCount = 0;
        Set<String> deptSet = new LinkedHashSet<>();

        for (Maintainer m : allList) {
            if ("在岗".equals(m.getStatus())) {
                onDutyCount++;
            } else if ("轮休".equals(m.getStatus())) {
                restingCount++;
            } else if ("请假".equals(m.getStatus())) {
                leaveCount++;
            }
            if (m.getDepartment() != null && !m.getDepartment().trim().isEmpty()) {
                deptSet.add(m.getDepartment().trim());
            }
        }

        // 3. 存入请求域
        request.setAttribute("maintainerList", maintainerList);
        request.setAttribute("totalCount", totalCount);
        request.setAttribute("onDutyCount", onDutyCount);
        request.setAttribute("restingCount", restingCount);
        request.setAttribute("leaveCount", leaveCount);
        request.setAttribute("departmentList", new ArrayList<>(deptSet));
        request.setAttribute("keyword", keyword != null ? keyword : "");
        request.setAttribute("department", department != null ? department : "");
        request.setAttribute("status", status != null ? status : "");

        request.getRequestDispatcher("maintainer.jsp").forward(request, response);
    }

    @Override
    protected void doPost(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        doGet(request, response);
    }
}
