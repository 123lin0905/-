package Servlet;

import DB.DBTools;
import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.example.demo1.Maintainer;

import java.io.IOException;

@WebServlet(name = "UpdateMaintainerServlet", value = "/UpdateMaintainerServlet")
public class UpdateMaintainerServlet extends HttpServlet {

    @Override
    protected void doPost(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        request.setCharacterEncoding("UTF-8");
        response.setCharacterEncoding("UTF-8");

        String idStr = request.getParameter("id");
        String staffNo = request.getParameter("staffNo");
        String name = request.getParameter("name");
        String gender = request.getParameter("gender");
        String phone = request.getParameter("phone");
        String department = request.getParameter("department");
        String duty = request.getParameter("duty");
        String status = request.getParameter("status");
        String entryDate = request.getParameter("entryDate");
        String remark = request.getParameter("remark");

        if (idStr != null && !idStr.trim().isEmpty()) {
            try {
                int id = Integer.parseInt(idStr.trim());
                Maintainer m = new Maintainer(
                        id,
                        staffNo != null ? staffNo.trim() : "",
                        name != null ? name.trim() : "",
                        gender != null ? gender.trim() : "男",
                        phone != null ? phone.trim() : "",
                        department != null ? department.trim() : "",
                        duty != null ? duty.trim() : "",
                        status != null ? status.trim() : "在岗",
                        entryDate != null ? entryDate.trim() : "",
                        remark != null ? remark.trim() : ""
                );
                DBTools dbTools = new DBTools();
                dbTools.updateMaintainer(m);
            } catch (NumberFormatException e) {
                System.out.println("无效的人员ID: " + idStr);
            }
        }

        response.sendRedirect("MaintainerServlet");
    }

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        doPost(request, response);
    }
}
