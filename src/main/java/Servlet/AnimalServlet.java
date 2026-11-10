package Servlet;

import DB.DBTools;
import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.example.demo1.Animal;
import org.example.demo1.Maintainer;
import org.example.demo1.PlantArea;

import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.List;

@WebServlet(name = "AnimalServlet", value = "/AnimalServlet")
public class AnimalServlet extends HttpServlet {

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        request.setCharacterEncoding("UTF-8");
        String keyword = request.getParameter("keyword");
        String category = request.getParameter("category");

        DBTools dbTools = new DBTools();
        List<Animal> animalList = dbTools.queryAllAnimals(keyword, category);
        List<PlantArea> areaList = dbTools.queryAllAreas();
        List<Maintainer> maintainerList = dbTools.queryAllMaintainers(null, null, null);

        int totalSpecies = dbTools.getAnimalSpeciesCount();
        int totalCount = dbTools.getTotalAnimalCount();
        int dueFeedingCount = dbTools.getDueFeedingAnimalCount();

        request.setAttribute("animalList", animalList);
        request.setAttribute("areaList", areaList);
        request.setAttribute("maintainerList", maintainerList);
        request.setAttribute("totalSpecies", totalSpecies);
        request.setAttribute("totalCount", totalCount);
        request.setAttribute("dueFeedingCount", dueFeedingCount);
        request.setAttribute("keyword", keyword != null ? keyword : "");
        request.setAttribute("category", category != null ? category : "");

        request.getRequestDispatcher("/animal.jsp").forward(request, response);
    }

    @Override
    protected void doPost(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        request.setCharacterEncoding("UTF-8");
        String action = request.getParameter("action");
        if (action == null || action.trim().isEmpty()) {
            action = "add";
        }

        DBTools dbTools = new DBTools();
        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd");

        if ("feed".equalsIgnoreCase(action)) {
            // 一键打卡投喂照料
            handleFeed(request, response, dbTools, sdf);
            return;
        } else if ("delete".equalsIgnoreCase(action)) {
            // 删除动物档案
            handleDelete(request, response, dbTools);
            return;
        } else if ("update".equalsIgnoreCase(action)) {
            // 编辑修改动物档案
            handleUpdate(request, response, dbTools);
            return;
        } else {
            // 新增动物档案
            handleAdd(request, response, dbTools, sdf);
        }
    }

    private void handleAdd(HttpServletRequest request, HttpServletResponse response, DBTools dbTools, SimpleDateFormat sdf) throws IOException {
        String animalNo = request.getParameter("animalNo");
        if (animalNo == null || animalNo.trim().isEmpty()) {
            animalNo = "AN-" + (System.currentTimeMillis() % 100000);
        } else {
            animalNo = animalNo.trim();
        }

        String name = request.getParameter("name");
        String species = request.getParameter("species");
        String category = request.getParameter("category");
        if (category == null || category.trim().isEmpty()) category = "水禽鸟类";

        int count = 1;
        try {
            count = Integer.parseInt(request.getParameter("count"));
        } catch (Exception ignored) {}

        Integer areaId = null;
        try {
            areaId = Integer.parseInt(request.getParameter("areaId"));
        } catch (Exception ignored) {}

        String areaName = request.getParameter("areaName");
        if ((areaName == null || areaName.trim().isEmpty()) && areaId != null) {
            List<PlantArea> areas = dbTools.queryAllAreas();
            if (areas != null) {
                for (PlantArea a : areas) {
                    if (a.getId() == areaId) {
                        areaName = a.getAreaName();
                        break;
                    }
                }
            }
        }
        if (areaName == null || areaName.trim().isEmpty()) areaName = "天府湖水域生态区";

        String healthStatus = request.getParameter("healthStatus");
        if (healthStatus == null || healthStatus.trim().isEmpty()) healthStatus = "健康活泼";

        String dietType = request.getParameter("dietType");
        if (dietType == null || dietType.trim().isEmpty()) dietType = "专用生态配合饲料";

        int feedingCycleDays = 1;
        try {
            feedingCycleDays = Integer.parseInt(request.getParameter("feedingCycleDays"));
        } catch (Exception ignored) {}

        String nextFeedingDate = request.getParameter("nextFeedingDate");
        if (nextFeedingDate == null || nextFeedingDate.trim().isEmpty()) {
            Calendar cal = Calendar.getInstance();
            cal.add(Calendar.DAY_OF_YEAR, feedingCycleDays);
            nextFeedingDate = sdf.format(cal.getTime());
        }

        String keeperName = request.getParameter("keeperName");
        if (keeperName == null || keeperName.trim().isEmpty()) keeperName = "生态保育专员";

        String birthDate = request.getParameter("birthDate");
        if (birthDate == null || birthDate.trim().isEmpty()) birthDate = sdf.format(new Date());

        String picUrl = request.getParameter("picUrl");
        String remark = request.getParameter("remark");

        Animal animal = new Animal(animalNo, name, species, category, count, areaId, areaName,
                healthStatus, dietType, feedingCycleDays, nextFeedingDate, keeperName, birthDate, picUrl, remark);

        dbTools.addAnimal(animal);

        // 如果是 AJAX 请求
        if ("XMLHttpRequest".equalsIgnoreCase(request.getHeader("X-Requested-With"))) {
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"success\":true,\"message\":\"成功录入生态动物档案【" + name + "】！\"}");
            return;
        }

        response.sendRedirect(request.getContextPath() + "/AnimalServlet?msg=add_success");
    }

    private void handleUpdate(HttpServletRequest request, HttpServletResponse response, DBTools dbTools) throws IOException {
        int id = 0;
        try {
            id = Integer.parseInt(request.getParameter("id"));
        } catch (Exception e) {
            response.sendRedirect(request.getContextPath() + "/AnimalServlet?err=invalid_id");
            return;
        }

        Animal animal = dbTools.queryAnimalById(id);
        if (animal == null) {
            response.sendRedirect(request.getContextPath() + "/AnimalServlet?err=not_found");
            return;
        }

        animal.setAnimalNo(request.getParameter("animalNo"));
        animal.setName(request.getParameter("name"));
        animal.setSpecies(request.getParameter("species"));
        animal.setCategory(request.getParameter("category"));
        try {
            animal.setCount(Integer.parseInt(request.getParameter("count")));
        } catch (Exception ignored) {}

        try {
            animal.setAreaId(Integer.parseInt(request.getParameter("areaId")));
        } catch (Exception ignored) {}
        animal.setAreaName(request.getParameter("areaName"));
        animal.setHealthStatus(request.getParameter("healthStatus"));
        animal.setDietType(request.getParameter("dietType"));
        try {
            animal.setFeedingCycleDays(Integer.parseInt(request.getParameter("feedingCycleDays")));
        } catch (Exception ignored) {}
        animal.setNextFeedingDate(request.getParameter("nextFeedingDate"));
        animal.setKeeperName(request.getParameter("keeperName"));
        animal.setBirthDate(request.getParameter("birthDate"));
        animal.setPicUrl(request.getParameter("picUrl"));
        animal.setRemark(request.getParameter("remark"));

        dbTools.updateAnimal(animal);

        if ("XMLHttpRequest".equalsIgnoreCase(request.getHeader("X-Requested-With"))) {
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"success\":true,\"message\":\"成功更新生态动物【" + animal.getName() + "】档案！\"}");
            return;
        }

        response.sendRedirect(request.getContextPath() + "/AnimalServlet?msg=update_success");
    }

    private void handleDelete(HttpServletRequest request, HttpServletResponse response, DBTools dbTools) throws IOException {
        int id = 0;
        try {
            id = Integer.parseInt(request.getParameter("id"));
        } catch (Exception e) {
            response.sendRedirect(request.getContextPath() + "/AnimalServlet?err=invalid_id");
            return;
        }

        dbTools.deleteAnimal(id);

        if ("XMLHttpRequest".equalsIgnoreCase(request.getHeader("X-Requested-With"))) {
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"success\":true,\"message\":\"已成功移除该动物档案！\"}");
            return;
        }

        response.sendRedirect(request.getContextPath() + "/AnimalServlet?msg=delete_success");
    }

    private void handleFeed(HttpServletRequest request, HttpServletResponse response, DBTools dbTools, SimpleDateFormat sdf) throws IOException {
        int id = 0;
        try {
            id = Integer.parseInt(request.getParameter("id"));
        } catch (Exception e) {
            response.getWriter().write("{\"success\":false,\"message\":\"无效动物ID\"}");
            return;
        }

        Animal animal = dbTools.queryAnimalById(id);
        if (animal == null) {
            response.getWriter().write("{\"success\":false,\"message\":\"未找到该动物\"}");
            return;
        }

        int cycle = animal.getFeedingCycleDays() != null && animal.getFeedingCycleDays() > 0 ? animal.getFeedingCycleDays() : 1;
        Calendar cal = Calendar.getInstance();
        cal.add(Calendar.DAY_OF_YEAR, cycle);
        String nextDate = sdf.format(cal.getTime());

        dbTools.updateAnimalFeedingDate(id, nextDate);

        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write("{\"success\":true,\"message\":\"已完成【" + animal.getName() + "】今日投喂巡检！下次投喂日期自动顺延至：" + nextDate + "\"}");
    }
}
