package Servlet;

import DB.DBTools;
import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.example.demo1.Maintainer;

import java.io.IOException;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

@WebServlet(name = "AddMaintainerServlet", value = "/AddMaintainerServlet")
public class AddMaintainerServlet extends HttpServlet {

    @Override
    protected void doPost(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        request.setCharacterEncoding("UTF-8");
        response.setCharacterEncoding("UTF-8");

        String staffNo = request.getParameter("staffNo");
        String name = request.getParameter("name");
        String gender = request.getParameter("gender");
        String phone = request.getParameter("phone");
        String department = request.getParameter("department");
        String duty = request.getParameter("duty");
        String status = request.getParameter("status");
        String entryDate = request.getParameter("entryDate");
        String remark = request.getParameter("remark");

        // 默认与容错补全
        if (staffNo == null || staffNo.trim().isEmpty()) {
            staffNo = "WH-" + (System.currentTimeMillis() % 10000);
        }
        if (name == null || name.trim().isEmpty()) {
            name = "养护技师";
        }
        if (gender == null || gender.trim().isEmpty()) {
            gender = "男";
        }
        if (phone == null || phone.trim().isEmpty()) {
            phone = "暂无联系方式";
        }
        if (department == null || department.trim().isEmpty()) {
            department = "综合养护组";
        }
        if (duty == null || duty.trim().isEmpty()) {
            duty = "绿植养护员";
        }
        if (status == null || status.trim().isEmpty()) {
            status = "在岗";
        }
        if (entryDate == null || entryDate.trim().isEmpty()) {
            entryDate = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd"));
        }
        if (remark == null || remark.trim().isEmpty()) {
            remark = "负责苗木园区日常健康巡检与养护作业";
        }

        Maintainer m = new Maintainer(
                staffNo.trim(),
                name.trim(),
                gender.trim(),
                phone.trim(),
                department.trim(),
                duty.trim(),
                status.trim(),
                entryDate.trim(),
                remark.trim()
        );

        DBTools dbTools = new DBTools();
        dbTools.addMaintainer(m);

        response.sendRedirect("MaintainerServlet");
    }

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        doPost(request, response);
    }
}
