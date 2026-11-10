package Servlet;

import DB.DBTools;
import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.example.demo1.Plant;

import java.io.IOException;

@WebServlet(name = "EditPlantServlet", value = "/EditPlantServlet")
public class EditPlantServlet extends HttpServlet {
    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        String pid = request.getParameter("pid");
        if (pid != null && !pid.trim().isEmpty()) {
            DBTools dbTools = new DBTools();
            Plant plant = dbTools.queryPlantById(pid.trim());
            request.setAttribute("plant", plant);
        }
        request.getRequestDispatcher("editplant.jsp").forward(request, response);
    }

    @Override
    protected void doPost(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        doGet(request, response);
    }
}
