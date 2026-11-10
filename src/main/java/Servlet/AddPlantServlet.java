package Servlet;

import DB.DBTools;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import java.io.IOException;
import java.util.UUID;
@WebServlet(name = "AddPlantServlet", value = "/AddPlantServlet")
public class AddPlantServlet extends HttpServlet {
    @Override
    public void service(ServletRequest request, ServletResponse response) throws ServletException, IOException {
        request.setCharacterEncoding("UTF-8");
        response.setCharacterEncoding("UTF-8");
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

        // System.out.println(pname+ptype+pdatetime+pprice+ppic+pdesc);
        // 请帮我把上面的数据保存到表中
        String pid = UUID.randomUUID().toString().replace("-", "");

        DBTools dbTools = new DBTools();
        // 提示：若输入带小数（如28000.00），直接 Integer.valueOf 会报 NumberFormatException，可按需处理
        int pprice1 = Integer.valueOf(pprice.contains(".") ? pprice.substring(0, pprice.indexOf(".")) : pprice);
        dbTools.addplant(pid, pname, ptype, pdatetime, pprice1, ppic, pdesc,
                areaId, latitude, longitude, trimPeriodDays, fertilizePeriodDays,
                waterPeriodDays, pestPeriodDays, nextTrimDate, nextFertilizeDate,
                nextWaterDate, nextPestDate);

        request.getRequestDispatcher("index.jsp").forward(request, response);
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
