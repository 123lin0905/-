package Servlet;

import DB.DBTools;
import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.example.demo1.Plant;

import java.io.IOException;
import java.util.List;

@WebServlet(name = "QueryServlet", value = "/QueryServlet")
public class QueryServlet extends HttpServlet {
    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        DBTools dbTools = new DBTools();
        List<Plant> plantList = dbTools.queryAllPlants();
        
        request.setAttribute("plantList", plantList);
        request.getRequestDispatcher("searchplant.jsp").forward(request, response);
    }
}
