package Servlet;

import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;

/**
 * 原 GreenKeeperServlet，现已全面整合并入 AreaServlet (智慧校园网格与植株智能标绘中心)。
 * 自动 302 重定向至 AreaServlet，保障历史链接与书签完美兼容。
 */
@WebServlet(name = "GreenKeeperServlet", value = "/GreenKeeperServlet")
public class GreenKeeperServlet extends HttpServlet {

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        response.sendRedirect("AreaServlet");
    }

    @Override
    protected void doPost(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        response.sendRedirect("AreaServlet");
    }
}
