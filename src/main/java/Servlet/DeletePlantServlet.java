package Servlet;

import DB.DBTools;
import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;

@WebServlet(name = "DeletePlantServlet", value = "/DeletePlantServlet")
public class DeletePlantServlet extends HttpServlet {
    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        String pid = request.getParameter("pid");
        if (pid != null && !pid.trim().isEmpty()) {
            DBTools dbTools = new DBTools();
            dbTools.deletePlant(pid.trim());
        }
        response.sendRedirect("QueryServlet");
    }

    @Override
    protected void doPost(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        doGet(request, response);
    }
}
