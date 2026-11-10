package Servlet;

import DB.DBTools;
import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;

@WebServlet(name = "UpdatePlantServlet", value = "/UpdatePlantServlet")
public class UpdatePlantServlet extends HttpServlet {
    @Override
    protected void doPost(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        request.setCharacterEncoding("UTF-8");
        response.setCharacterEncoding("UTF-8");

        String pid = request.getParameter("pid");
        String pname = request.getParameter("pname");
        String ptype = request.getParameter("ptype");
        String pdatetime = request.getParameter("pdatetime");
        String pprice = request.getParameter("pprice");
        String ppic = request.getParameter("ppic");
        String pdesc = request.getParameter("pdesc");
        Integer areaId = parseInteger(request.getParameter("areaId"));
        Double latitude = parseDouble(request.getParameter("latitude"));
        Double longitude = parseDouble(request.getParameter("longitude"));
        Integer trimPeriodDays = parseInteger(request.getParameter("trimPeriodDays"));
        Integer fertilizePeriodDays = parseInteger(request.getParameter("fertilizePeriodDays"));
        Integer waterPeriodDays = parseInteger(request.getParameter("waterPeriodDays"));
        Integer pestPeriodDays = parseInteger(request.getParameter("pestPeriodDays"));
        String nextTrimDate = emptyToNull(request.getParameter("nextTrimDate"));
        String nextFertilizeDate = emptyToNull(request.getParameter("nextFertilizeDate"));
        String nextWaterDate = emptyToNull(request.getParameter("nextWaterDate"));
        String nextPestDate = emptyToNull(request.getParameter("nextPestDate"));

        int pprice1 = 0;
        if (pprice != null && !pprice.trim().isEmpty()) {
            try {
                String priceStr = pprice.trim();
                pprice1 = Integer.valueOf(priceStr.contains(".") ? priceStr.substring(0, priceStr.indexOf(".")) : priceStr);
            } catch (Exception e) {
                pprice1 = 0;
            }
        }

        if (pid != null && !pid.trim().isEmpty()) {
            DBTools dbTools = new DBTools();
            dbTools.updatePlant(pid, pname, ptype, pdatetime, pprice1, ppic, pdesc,
                    areaId, latitude, longitude, trimPeriodDays, fertilizePeriodDays,
                    waterPeriodDays, pestPeriodDays, nextTrimDate, nextFertilizeDate,
                    nextWaterDate, nextPestDate);
        }

        response.sendRedirect("QueryServlet");
    }

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        doPost(request, response);
    }

    private Integer parseInteger(String value) {
        try {
            return value == null || value.trim().isEmpty() ? null : Integer.valueOf(value.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private Double parseDouble(String value) {
        try {
            return value == null || value.trim().isEmpty() ? null : Double.valueOf(value.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private String emptyToNull(String value) {
        return value == null || value.trim().isEmpty() ? null : value.trim();
    }
}
