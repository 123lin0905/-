package Servlet;

import DB.DBTools;
import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;

@WebServlet(name = "DeleteMaintenanceServlet", value = "/DeleteMaintenanceServlet")
public class DeleteMaintenanceServlet extends HttpServlet {

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        String midStr = request.getParameter("mid");
        if (midStr != null && !midStr.trim().isEmpty()) {
            try {
                int mid = Integer.parseInt(midStr.trim());
                DBTools dbTools = new DBTools();
                dbTools.deleteMaintenance(mid);
            } catch (NumberFormatException e) {
                System.out.println("无效的维护记录ID: " + midStr);
            }
        }
        response.sendRedirect("MaintainServlet");
    }

    @Override
    protected void doPost(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        doGet(request, response);
    }
}
