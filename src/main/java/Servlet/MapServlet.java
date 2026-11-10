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

@WebServlet(name = "MapServlet", value = "/MapServlet")
public class MapServlet extends HttpServlet {
    public static final String EXTERNAL_MAP_URL =
            "https://apis.map.qq.com/tools/poimarker?type=0&marker=coord:31.492761,104.690207;title=%E8%A5%BF%E5%8D%97%E8%B4%A2%E7%BB%8F%E5%A4%A7%E5%AD%A6%E5%A4%A9%E5%BA%9C%E5%AD%A6%E9%99%A2(%E7%BB%B5%E9%98%B3%E6%A0%A1%E5%8C%BA);addr=%E5%9B%9B%E5%B7%9D%E7%9C%81%E7%BB%B5%E9%98%B3%E5%B8%82%E7%A7%91%E6%8A%80%E5%9F%8E%E6%96%B0%E5%8C%BA%E5%9B%AD%E5%85%B4%E8%A5%BF%E8%A1%972%E5%8F%B7&key=OB4BZ-D4W3U-B7VVO-4PJWW-6TKDJ-WPB77&referer=myapp";

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        response.sendRedirect("AreaServlet");
    }

    @Override
    protected void doPost(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        doGet(request, response);
    }
}
