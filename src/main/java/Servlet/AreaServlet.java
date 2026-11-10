package Servlet;

import DB.DBTools;
import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.MultipartConfig;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.example.demo1.Animal;
import org.example.demo1.Maintainer;
import org.example.demo1.Plant;
import org.example.demo1.PlantArea;
import org.example.demo1.PlantMaintenance;
import org.example.demo1.PlantType;

import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.Map;

@WebServlet(name = "AreaServlet", value = "/AreaServlet")
@MultipartConfig
public class AreaServlet extends HttpServlet {

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        DBTools dbTools = new DBTools();
        String action = request.getParameter("action");
        String format = request.getParameter("format");
        String accept = request.getHeader("Accept");

        // 1. 异步查询单株植物养护流水
        if ("getPlantRecords".equalsIgnoreCase(action)) {
            String pid = request.getParameter("pid");
            List<PlantMaintenance> records = dbTools.queryMaintenanceByPid(pid);
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"success\":true,\"records\":" + maintenanceToJson(records) + "}");
            return;
        }

        // 2. 异步查询全量数据 (JSON 模式)
        if ("json".equalsIgnoreCase(format) || (accept != null && accept.contains("application/json"))) {
            List<PlantArea> areaList = dbTools.queryAllAreas();
            List<Plant> plantList = dbTools.queryAllPlants();
            List<Animal> animalList = dbTools.queryAllAnimals(null, null);
            Map<String, Maintainer> plantMaintainerMap = dbTools.queryPlantMaintainerMap();
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"success\":true,\"areas\":" + areasToJson(areaList) + ",\"plants\":" + plantsToJson(plantList, dbTools.getLastMaintenanceMap(), plantMaintainerMap) + ",\"animals\":" + animalsToJson(animalList) + "}");
            return;
        }

        // 3. 正常转发到整合后的统一标绘中心 area.jsp
        List<PlantArea> areaList = dbTools.queryAllAreas();
        List<Maintainer> maintainerList = dbTools.queryAllMaintainers(null, null, null);
        List<Plant> plantList = dbTools.queryAllPlants();
        List<Animal> animalList = dbTools.queryAllAnimals(null, null);
        List<PlantType> plantTypeList = dbTools.queryAllPlantTypes();
        Map<String, PlantMaintenance> lastMaintenanceMap = dbTools.getLastMaintenanceMap();
        Map<String, Maintainer> plantMaintainerMap = dbTools.queryPlantMaintainerMap();

        request.setAttribute("areaList", areaList);
        request.setAttribute("maintainerList", maintainerList);
        request.setAttribute("plantList", plantList);
        request.setAttribute("animalList", animalList);
        request.setAttribute("plantTypeList", plantTypeList);
        request.setAttribute("lastMaintenanceMap", lastMaintenanceMap);
        request.setAttribute("plantMaintainerMap", plantMaintainerMap);
        request.getRequestDispatcher("area.jsp").forward(request, response);
    }

    @Override
    protected void doPost(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        request.setCharacterEncoding("UTF-8");
        String action = request.getParameter("action");
        boolean isAjax = "XMLHttpRequest".equalsIgnoreCase(request.getHeader("X-Requested-With"))
                || "true".equalsIgnoreCase(request.getParameter("ajax"))
                || "json".equalsIgnoreCase(request.getParameter("format"));

        DBTools dbTools = new DBTools();
        boolean success = true;
        String message = "操作成功";
        String extraJson = "";

        try {
            // (1) 拖拽植物图钉保存新坐标
            if ("updatePlantLocation".equalsIgnoreCase(action)) {
                String pid = request.getParameter("pid");
                Double lat = nullableDouble(request.getParameter("latitude"));
                Double lng = nullableDouble(request.getParameter("longitude"));
                Integer areaId = nullableInteger(request.getParameter("areaId"));
                if (pid != null && !pid.trim().isEmpty() && lat != null && lng != null) {
                    boolean ok = dbTools.updatePlantLocation(pid.trim(), lat, lng, areaId);
                    success = ok;
                    message = ok ? "植株坐标已成功更新并持久化至 MySQL" : "更新植株坐标失败";
                } else {
                    success = false;
                    message = "缺少必要的坐标参数或植株编号";
                }
            }
            // (1.1) 拖拽生态动物图钉保存新坐标
            else if ("updateAnimalLocation".equalsIgnoreCase(action)) {
                Integer aid = nullableInteger(request.getParameter("id"));
                Double lat = nullableDouble(request.getParameter("latitude"));
                Double lng = nullableDouble(request.getParameter("longitude"));
                Integer areaId = nullableInteger(request.getParameter("areaId"));
                if (aid != null && lat != null && lng != null) {
                    boolean ok = dbTools.updateAnimalLocation(aid, lat, lng, areaId);
                    success = ok;
                    message = ok ? "生态动物栖息坐标已成功更新并持久化至 MySQL" : "更新动物坐标失败";
                } else {
                    success = false;
                    message = "缺少必要的动物ID或坐标参数";
                }
            }
            // (2) 在地图上标绘新增绿植
            else if ("addPlantMarker".equalsIgnoreCase(action)) {
                String pid = request.getParameter("pid");
                if (pid == null || pid.trim().isEmpty()) {
                    int count = dbTools.queryAllPlants().size() + 1;
                    pid = "TF-PLANT-" + String.format("%03d", count);
                }
                String pname = required(request.getParameter("pname"), "绵阳校区新标绘绿植");
                String ptype = required(request.getParameter("ptype"), "乔木");
                String pdatetime = required(request.getParameter("pdatetime"), new SimpleDateFormat("yyyy-MM-dd").format(new Date()));
                int pprice = nullableInteger(request.getParameter("pprice")) != null ? nullableInteger(request.getParameter("pprice")) : 120;
                String ppic = request.getParameter("ppic");
                if (ppic == null || ppic.trim().isEmpty()) {
                    ppic = "greenkeeper/assets/plant-camphor.svg";
                }
                String pdesc = request.getParameter("pdesc");
                if (pdesc == null || pdesc.trim().isEmpty()) {
                    pdesc = "天府学院绵阳校区实景标绘绿植";
                }
                Integer areaId = nullableInteger(request.getParameter("areaId"));
                Double lat = nullableDouble(request.getParameter("latitude"));
                Double lng = nullableDouble(request.getParameter("longitude"));
                if (lat == null) lat = 31.492761;
                if (lng == null) lng = 104.690207;

                // 周期天数
                Integer trimDays = nullableInteger(request.getParameter("trimPeriodDays"));
                if (trimDays == null) trimDays = 60;
                Integer fertDays = nullableInteger(request.getParameter("fertilizePeriodDays"));
                if (fertDays == null) fertDays = 30;
                Integer waterDays = nullableInteger(request.getParameter("waterPeriodDays"));
                if (waterDays == null) waterDays = 7;
                Integer pestDays = nullableInteger(request.getParameter("pestPeriodDays"));
                if (pestDays == null) pestDays = 45;

                dbTools.addplant(pid, pname, ptype, pdatetime, pprice, ppic, pdesc,
                        areaId, lat, lng, trimDays, fertDays, waterDays, pestDays,
                        null, null, null, null);

                // 标绘时若直接指定了养护人员，即刻关联写入
                Integer maintainerId = nullableInteger(request.getParameter("maintainerId"));
                if (maintainerId != null && maintainerId > 0) {
                    dbTools.setPlantMaintainer(pid, maintainerId);
                }

                success = true;
                message = "已成功在绵阳校区高德地图标绘【" + pname + "】并录入数据库！";
            }
            // (2.1) 直接编辑作物档案并布置养护人员
            else if ("editPlantCrop".equalsIgnoreCase(action) || "updatePlant".equalsIgnoreCase(action)) {
                String pid = request.getParameter("pid");
                if (pid != null && !pid.trim().isEmpty()) {
                    Plant existing = dbTools.queryPlantById(pid.trim());
                    if (existing != null) {
                        String pname = required(request.getParameter("pname"), existing.getPname());
                        String ptype = required(request.getParameter("ptype"), existing.getPtype());
                        String pdatetime = required(request.getParameter("pdatetime"), existing.getPdatetime());
                        String ppic = required(request.getParameter("ppic"), existing.getPpic());
                        String pdesc = request.getParameter("pdesc") != null ? request.getParameter("pdesc") : existing.getPdesc();
                        Integer trimDays = nullableInteger(request.getParameter("trimPeriodDays"));
                        if (trimDays == null) trimDays = existing.getTrimPeriodDays();
                        Integer fertDays = nullableInteger(request.getParameter("fertilizePeriodDays"));
                        if (fertDays == null) fertDays = existing.getFertilizePeriodDays();
                        Integer waterDays = nullableInteger(request.getParameter("waterPeriodDays"));
                        if (waterDays == null) waterDays = existing.getWaterPeriodDays();
                        Integer pestDays = nullableInteger(request.getParameter("pestPeriodDays"));
                        if (pestDays == null) pestDays = existing.getPestPeriodDays();

                        dbTools.updatePlant(pid.trim(), pname, ptype, pdatetime, existing.getPprice(), ppic, pdesc,
                                existing.getAreaId(), existing.getLatitude(), existing.getLongitude(),
                                trimDays, fertDays, waterDays, pestDays,
                                existing.getNextTrimDate(), existing.getNextFertilizeDate(), existing.getNextWaterDate(), existing.getNextPestDate());

                        // 直接布置/更新责任养护人员
                        if (request.getParameter("maintainerId") != null) {
                            Integer mid = nullableInteger(request.getParameter("maintainerId"));
                            dbTools.setPlantMaintainer(pid.trim(), mid);
                        }

                        success = true;
                        message = "作物【" + pname + "】信息已成功更新，责任养护人员已布置就绪！";
                    } else {
                        success = false;
                        message = "未找到该作物档案";
                    }
                } else {
                    success = false;
                    message = "缺少作物编号参数";
                }
            }
            // (3) 删除已标绘植株
            else if ("deletePlantMarker".equalsIgnoreCase(action)) {
                String pid = request.getParameter("pid");
                if (pid != null && !pid.trim().isEmpty()) {
                    dbTools.deletePlant(pid.trim());
                    message = "绿植点位已成功移除";
                }
            }
            // (3.1) 在地图上标绘新增生态动物
            else if ("addAnimalMarker".equalsIgnoreCase(action)) {
                String animalNo = request.getParameter("animalNo");
                if (animalNo == null || animalNo.trim().isEmpty()) {
                    animalNo = "AN-" + (System.currentTimeMillis() % 100000);
                }
                String name = required(request.getParameter("name"), "新标绘生态动物");
                String species = request.getParameter("species");
                String category = required(request.getParameter("category"), "水禽鸟类");
                Integer count = nullableInteger(request.getParameter("count"));
                if (count == null || count < 1) count = 1;
                Integer areaId = nullableInteger(request.getParameter("areaId"));
                String areaName = required(request.getParameter("areaName"), "天府湖水域生态区");
                Double lat = nullableDouble(request.getParameter("latitude"));
                Double lng = nullableDouble(request.getParameter("longitude"));
                if (lat == null) lat = 31.492200;
                if (lng == null) lng = 104.688200;
                String healthStatus = required(request.getParameter("healthStatus"), "健康活泼");
                String dietType = required(request.getParameter("dietType"), "常规禽料/生态采食");
                Integer cycle = nullableInteger(request.getParameter("feedingCycleDays"));
                if (cycle == null || cycle < 1) cycle = 1;
                String keeper = required(request.getParameter("keeperName"), "生态保育员");
                String picUrl = request.getParameter("picUrl");
                String remark = request.getParameter("remark");

                SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd");
                Calendar c = Calendar.getInstance();
                c.add(Calendar.DAY_OF_YEAR, cycle);
                String nextFeed = sdf.format(c.getTime());

                Animal animal = new Animal(animalNo, name, species, category, count, areaId, areaName, lat, lng,
                        healthStatus, dietType, cycle, nextFeed, keeper, sdf.format(new Date()), picUrl, remark);
                boolean ok = dbTools.addAnimal(animal);
                success = ok;
                message = ok ? "已成功在地图标绘生态动物【" + name + "】并持久化至 MySQL！" : "标绘生态动物失败，可能编号冲突";
            }
            // (3.2) 删除已标绘生态动物
            else if ("deleteAnimalMarker".equalsIgnoreCase(action)) {
                Integer aid = nullableInteger(request.getParameter("id"));
                if (aid != null) {
                    boolean ok = dbTools.deleteAnimal(aid);
                    success = ok;
                    message = ok ? "生态动物点位已成功移除" : "删除生态动物失败";
                } else {
                    success = false;
                    message = "缺少生态动物ID";
                }
            }
            // (3.3) 快速投喂巡护打卡
            else if ("feedAnimal".equalsIgnoreCase(action)) {
                Integer aid = nullableInteger(request.getParameter("id"));
                if (aid != null) {
                    Animal a = dbTools.queryAnimalById(aid);
                    if (a != null) {
                        int cycle = (a.getFeedingCycleDays() != null && a.getFeedingCycleDays() > 0) ? a.getFeedingCycleDays() : 1;
                        Calendar cal = Calendar.getInstance();
                        cal.add(Calendar.DAY_OF_YEAR, cycle);
                        String nextFeed = new SimpleDateFormat("yyyy-MM-dd").format(cal.getTime());
                        boolean ok = dbTools.updateAnimalFeedingDate(aid, nextFeed);
                        success = ok;
                        message = ok ? "【" + a.getName() + "】投喂巡护打卡成功！下次投喂安排：" + nextFeed : "投喂打卡失败";
                    } else {
                        success = false;
                        message = "未找到该生态动物";
                    }
                } else {
                    success = false;
                    message = "缺少动物ID";
                }
            }
            // (4) 快速记录植株养护作业 (💧浇水, 🌱施肥, 🍂修剪, 💊放药)
            else if ("addMaintenanceRecord".equalsIgnoreCase(action)) {
                String pid = request.getParameter("pid");
                String mtype = required(request.getParameter("mtype"), "浇水");
                String operator = request.getParameter("operator");
                String note = request.getParameter("note");
                boolean ok = dbTools.recordPlantCare(pid, mtype, operator, note);
                success = ok;
                message = ok ? "【" + mtype + "】养护作业记录已成功入库！" : "记录养护失败，未找到该植株";
                if (ok) {
                    List<PlantMaintenance> records = dbTools.queryMaintenanceByPid(pid);
                    extraJson = ",\"records\":" + maintenanceToJson(records);
                }
            }
            // (5) 指派/更换植株责任养护人员 (支持指定人员或设为待指派)
            else if ("assignPlantMaintainer".equalsIgnoreCase(action)) {
                String pid = request.getParameter("pid");
                Integer maintainerId = nullableInteger(request.getParameter("maintainerId"));
                if (pid != null && !pid.trim().isEmpty()) {
                    boolean ok = dbTools.setPlantMaintainer(pid.trim(), maintainerId);
                    success = ok;
                    if (ok) {
                        if (maintainerId != null && maintainerId > 0) {
                            Maintainer m = dbTools.queryMaintainerById(maintainerId);
                            String mName = (m != null && m.getName() != null) ? m.getName() : String.valueOf(maintainerId);
                            message = "已成功为植株【" + pid + "】安排责任养护员【" + mName + "】！";
                        } else {
                            message = "已更新植株【" + pid + "】养护责任人，当前状态为【待指派】";
                        }
                    } else {
                        message = "安排责任养护员失败，请稍后重试";
                    }
                } else {
                    success = false;
                    message = "缺少植株编号";
                }
            }
            // (6) 删除区域网格
            else if ("delete".equalsIgnoreCase(action)) {
                String idStr = request.getParameter("id");
                if (idStr != null && !idStr.trim().isEmpty()) {
                    dbTools.deleteArea(Integer.parseInt(idStr.trim()));
                    message = "管理区域已成功删除";
                }
            }
            // (7) 新增或更新网格区域
            else {
                Integer id = nullableInteger(request.getParameter("id"));
                String areaCode = request.getParameter("areaCode");
                String areaName = request.getParameter("areaName");
                Integer maintainerId = nullableInteger(request.getParameter("maintainerId"));
                Double latitude = nullableDouble(request.getParameter("centerLatitude"));
                Double longitude = nullableDouble(request.getParameter("centerLongitude"));
                Integer radius = nullableInteger(request.getParameter("radiusM"));
                String status = request.getParameter("status");
                if (status == null || status.trim().isEmpty()) {
                    status = "启用";
                }

                boolean isUpdate = "update".equalsIgnoreCase(action) || (id != null && !"add".equalsIgnoreCase(action));

                if (isUpdate) {
                    if (id != null) {
                        PlantArea existing = dbTools.queryAreaById(id);
                        if (existing != null) {
                            if (areaCode == null || areaCode.trim().isEmpty()) areaCode = existing.getAreaCode();
                            if (areaName == null || areaName.trim().isEmpty()) areaName = existing.getAreaName();
                            if (latitude == null) latitude = existing.getCenterLatitude();
                            if (longitude == null) longitude = existing.getCenterLongitude();
                            if (radius == null) radius = existing.getRadiusM();
                        }
                        areaName = required(areaName, "未命名区域");
                        boolean ok = dbTools.updateArea(id, areaCode, areaName, maintainerId, latitude, longitude, radius, status);
                        if (!ok) {
                            success = false;
                            message = "更新区域失败，请检查区域编号是否冲突";
                        } else {
                            message = "管理区域【" + areaName + "】与责任养护员更新成功";
                        }
                    } else {
                        PlantArea existing = (areaCode != null && !areaCode.trim().isEmpty()) ? dbTools.queryAreaByCode(areaCode.trim()) : null;
                        if (existing != null) {
                            if (areaName == null || areaName.trim().isEmpty()) areaName = existing.getAreaName();
                            boolean ok = dbTools.updateArea(existing.getId(), existing.getAreaCode(), areaName, maintainerId, latitude, longitude, radius, status);
                            if (!ok) {
                                success = false;
                                message = "更新区域失败";
                            } else {
                                message = "管理区域【" + areaName + "】与责任养护员更新成功";
                            }
                        } else {
                            success = false;
                            message = "未找到待更新的区域";
                        }
                    }
                } else {
                    areaCode = required(areaCode, "MY-AREA-" + String.format("%02d", dbTools.queryAllAreas().size() + 1));
                    areaName = required(areaName, "未命名区域");
                    boolean ok = dbTools.addArea(areaCode, areaName, maintainerId, latitude, longitude, radius);
                    if (!ok) {
                        success = false;
                        message = "新增区域失败，可能编号已存在";
                    } else {
                        message = "成功新增管理区域并绑定地理围栏";
                    }
                }
            }
        } catch (Exception e) {
            success = false;
            message = "处理请求失败: " + e.getMessage();
            System.out.println("处理区域与标绘请求失败: " + e.getMessage());
            e.printStackTrace();
        }

        if (isAjax) {
            response.setContentType("application/json;charset=UTF-8");
            List<PlantArea> updatedAreas = dbTools.queryAllAreas();
            List<Plant> updatedPlants = dbTools.queryAllPlants();
            List<Animal> updatedAnimals = dbTools.queryAllAnimals(null, null);
            Map<String, PlantMaintenance> lastMap = dbTools.getLastMaintenanceMap();
            Map<String, Maintainer> pMaintainerMap = dbTools.queryPlantMaintainerMap();
            response.getWriter().write("{\"success\":" + success + ",\"message\":\"" + escapeJson(message) +
                    "\",\"areas\":" + areasToJson(updatedAreas) +
                    ",\"plants\":" + plantsToJson(updatedPlants, lastMap, pMaintainerMap) +
                    ",\"animals\":" + animalsToJson(updatedAnimals) +
                    extraJson + "}");
            return;
        }

        response.sendRedirect("AreaServlet");
    }

    public static String areasToJson(List<PlantArea> list) {
        StringBuilder sb = new StringBuilder("[");
        if (list != null) {
            for (int i = 0; i < list.size(); i++) {
                PlantArea a = list.get(i);
                if (i > 0) sb.append(",");
                sb.append("{")
                  .append("\"id\":").append(a.getId()).append(",")
                  .append("\"areaCode\":\"").append(escapeJson(a.getAreaCode())).append("\",")
                  .append("\"areaName\":\"").append(escapeJson(a.getAreaName())).append("\",")
                  .append("\"maintainerId\":").append(a.getMaintainerId() == null ? "null" : a.getMaintainerId()).append(",")
                  .append("\"maintainerName\":").append(a.getMaintainerName() == null ? "null" : "\"" + escapeJson(a.getMaintainerName()) + "\"").append(",")
                  .append("\"centerLatitude\":").append(a.getCenterLatitude() == null ? "null" : a.getCenterLatitude()).append(",")
                  .append("\"centerLongitude\":").append(a.getCenterLongitude() == null ? "null" : a.getCenterLongitude()).append(",")
                  .append("\"radiusM\":").append(a.getRadiusM() == null ? 150 : a.getRadiusM()).append(",")
                  .append("\"status\":\"").append(escapeJson(a.getStatus() == null ? "启用" : a.getStatus())).append("\",")
                  .append("\"plantCount\":").append(a.getPlantCount())
                  .append("}");
            }
        }
        sb.append("]");
        return sb.toString();
    }

    public static String plantsToJson(List<Plant> list, Map<String, PlantMaintenance> lastMap) {
        return plantsToJson(list, lastMap, null);
    }

    public static String plantsToJson(List<Plant> list, Map<String, PlantMaintenance> lastMap, Map<String, Maintainer> pMaintainerMap) {
        StringBuilder sb = new StringBuilder("[");
        if (list != null) {
            SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd");
            String todayStr = sdf.format(new Date());

            for (int i = 0; i < list.size(); i++) {
                Plant p = list.get(i);
                if (i > 0) sb.append(",");

                PlantMaintenance lastM = (lastMap != null) ? lastMap.get(p.getPid()) : null;
                String lastCareType = (lastM != null && lastM.getMtype() != null) ? lastM.getMtype() : "常规养护";
                String lastCareDate = (lastM != null && lastM.getMdate() != null) ? lastM.getMdate() : (p.getPdatetime() != null ? p.getPdatetime() : todayStr);

                // 判断是否临期或超期
                String status = "normal";
                if (isOverdue(p.getNextWaterDate(), todayStr) || isOverdue(p.getNextFertilizeDate(), todayStr) ||
                    isOverdue(p.getNextTrimDate(), todayStr) || isOverdue(p.getNextPestDate(), todayStr)) {
                    status = "overdue";
                } else if (isDueSoon(p.getNextWaterDate(), todayStr) || isDueSoon(p.getNextFertilizeDate(), todayStr) ||
                           isDueSoon(p.getNextTrimDate(), todayStr) || isDueSoon(p.getNextPestDate(), todayStr)) {
                    status = "due";
                }

                Maintainer pm = (pMaintainerMap != null) ? pMaintainerMap.get(p.getPid()) : null;

                sb.append("{")
                  .append("\"id\":\"").append(escapeJson(p.getPid())).append("\",")
                  .append("\"code\":\"").append(escapeJson(p.getPid())).append("\",")
                  .append("\"name\":\"").append(escapeJson(p.getPname())).append("\",")
                  .append("\"species\":\"").append(escapeJson(p.getPtype() != null ? p.getPtype() : "绿植")).append("\",")
                  .append("\"plantedAt\":\"").append(escapeJson(p.getPdatetime() != null && p.getPdatetime().length() >= 10 ? p.getPdatetime().substring(0, 10) : todayStr)).append("\",")
                  .append("\"image\":\"").append(escapeJson(p.getPpic() != null && !p.getPpic().isEmpty() ? p.getPpic() : "greenkeeper/assets/plant-camphor.svg")).append("\",")
                  .append("\"note\":\"").append(escapeJson(p.getPdesc() != null ? p.getPdesc() : "")).append("\",")
                  .append("\"areaId\":").append(p.getAreaId() == null ? "null" : p.getAreaId()).append(",")
                  .append("\"lat\":").append(p.getLatitude() == null ? "31.492761" : p.getLatitude()).append(",")
                  .append("\"lng\":").append(p.getLongitude() == null ? "104.690207" : p.getLongitude()).append(",")
                  .append("\"maintainerId\":").append(pm != null ? pm.getId() : "null").append(",")
                  .append("\"maintainerName\":").append(pm != null && pm.getName() != null ? "\"" + escapeJson(pm.getName()) + "\"" : "null").append(",")
                  .append("\"maintainerDuty\":").append(pm != null && pm.getDuty() != null ? "\"" + escapeJson(pm.getDuty()) + "\"" : "null").append(",")
                  .append("\"maintainerPhone\":").append(pm != null && pm.getPhone() != null ? "\"" + escapeJson(pm.getPhone()) + "\"" : "null").append(",")
                  .append("\"status\":\"").append(status).append("\",")
                  .append("\"lastCareType\":\"").append(escapeJson(lastCareType)).append("\",")
                  .append("\"lastCareDate\":\"").append(escapeJson(lastCareDate)).append("\",")
                  .append("\"nextWaterDate\":").append(p.getNextWaterDate() == null ? "null" : "\"" + p.getNextWaterDate() + "\"").append(",")
                  .append("\"nextFertilizeDate\":").append(p.getNextFertilizeDate() == null ? "null" : "\"" + p.getNextFertilizeDate() + "\"").append(",")
                  .append("\"nextTrimDate\":").append(p.getNextTrimDate() == null ? "null" : "\"" + p.getNextTrimDate() + "\"").append(",")
                  .append("\"nextPestDate\":").append(p.getNextPestDate() == null ? "null" : "\"" + p.getNextPestDate() + "\"").append(",")
                  .append("\"waterPeriodDays\":").append(p.getWaterPeriodDays() == null ? 7 : p.getWaterPeriodDays()).append(",")
                  .append("\"fertilizePeriodDays\":").append(p.getFertilizePeriodDays() == null ? 30 : p.getFertilizePeriodDays()).append(",")
                  .append("\"trimPeriodDays\":").append(p.getTrimPeriodDays() == null ? 60 : p.getTrimPeriodDays()).append(",")
                  .append("\"pestPeriodDays\":").append(p.getPestPeriodDays() == null ? 45 : p.getPestPeriodDays())
                  .append("}");
            }
        }
        sb.append("]");
        return sb.toString();
    }

    public static String animalsToJson(List<Animal> list) {
        StringBuilder sb = new StringBuilder("[");
        if (list != null) {
            for (int i = 0; i < list.size(); i++) {
                Animal a = list.get(i);
                if (i > 0) sb.append(",");
                sb.append("{")
                  .append("\"id\":").append(a.getId()).append(",")
                  .append("\"animalNo\":\"").append(escapeJson(a.getAnimalNo())).append("\",")
                  .append("\"name\":\"").append(escapeJson(a.getName())).append("\",")
                  .append("\"species\":\"").append(escapeJson(a.getSpecies() != null ? a.getSpecies() : "")).append("\",")
                  .append("\"category\":\"").append(escapeJson(a.getCategory() != null ? a.getCategory() : "水禽鸟类")).append("\",")
                  .append("\"count\":").append(a.getCount()).append(",")
                  .append("\"areaId\":").append(a.getAreaId() == null ? "null" : a.getAreaId()).append(",")
                  .append("\"areaName\":\"").append(escapeJson(a.getAreaName() != null ? a.getAreaName() : "")).append("\",")
                  .append("\"lat\":").append(a.getLatitude() == null ? "null" : a.getLatitude()).append(",")
                  .append("\"lng\":").append(a.getLongitude() == null ? "null" : a.getLongitude()).append(",")
                  .append("\"healthStatus\":\"").append(escapeJson(a.getHealthStatus())).append("\",")
                  .append("\"dietType\":\"").append(escapeJson(a.getDietType() != null ? a.getDietType() : "")).append("\",")
                  .append("\"feedingCycleDays\":").append(a.getFeedingCycleDays() == null ? 1 : a.getFeedingCycleDays()).append(",")
                  .append("\"nextFeedingDate\":").append(a.getNextFeedingDate() == null ? "null" : "\"" + a.getNextFeedingDate() + "\"").append(",")
                  .append("\"keeperName\":\"").append(escapeJson(a.getKeeperName())).append("\",")
                  .append("\"birthDate\":").append(a.getBirthDate() == null ? "null" : "\"" + a.getBirthDate() + "\"").append(",")
                  .append("\"picUrl\":\"").append(escapeJson(a.getPicUrl() != null ? a.getPicUrl() : "")).append("\",")
                  .append("\"remark\":\"").append(escapeJson(a.getRemark() != null ? a.getRemark() : "")).append("\"")
                  .append("}");
            }
        }
        sb.append("]");
        return sb.toString();
    }

    public static String maintenanceToJson(List<PlantMaintenance> list) {
        StringBuilder sb = new StringBuilder("[");
        if (list != null) {
            for (int i = 0; i < list.size(); i++) {
                PlantMaintenance m = list.get(i);
                if (i > 0) sb.append(",");
                sb.append("{")
                  .append("\"mid\":").append(m.getMid()).append(",")
                  .append("\"pid\":\"").append(escapeJson(m.getPid())).append("\",")
                  .append("\"pname\":\"").append(escapeJson(m.getPname())).append("\",")
                  .append("\"type\":\"").append(escapeJson(m.getMtype())).append("\",")
                  .append("\"date\":\"").append(escapeJson(m.getMdate())).append("\",")
                  .append("\"operator\":\"").append(escapeJson(m.getOperator())).append("\",")
                  .append("\"healthStatus\":\"").append(escapeJson(m.getHealthStatus())).append("\",")
                  .append("\"note\":\"").append(escapeJson(m.getNotes())).append("\"")
                  .append("}");
            }
        }
        sb.append("]");
        return sb.toString();
    }

    private static boolean isOverdue(String targetDate, String today) {
        if (targetDate == null || targetDate.trim().isEmpty()) return false;
        return targetDate.trim().compareTo(today) < 0;
    }

    private static boolean isDueSoon(String targetDate, String today) {
        if (targetDate == null || targetDate.trim().isEmpty()) return false;
        // 目标日期在今天到今天+3天内
        return targetDate.trim().compareTo(today) >= 0 && targetDate.trim().compareTo(addDays(today, 3)) <= 0;
    }

    private static String addDays(String dateStr, int days) {
        try {
            SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd");
            Date d = sdf.parse(dateStr);
            java.util.Calendar cal = java.util.Calendar.getInstance();
            cal.setTime(d);
            cal.add(java.util.Calendar.DAY_OF_YEAR, days);
            return sdf.format(cal.getTime());
        } catch (Exception e) {
            return dateStr;
        }
    }

    private static String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\r", "\\r").replace("\n", "\\n");
    }

    private String required(String value, String fallback) {
        return value == null || value.trim().isEmpty() ? fallback : value.trim();
    }

    private Integer nullableInteger(String value) {
        try { return value == null || value.trim().isEmpty() ? null : Integer.valueOf(value.trim()); }
        catch (Exception e) { return null; }
    }

    private Double nullableDouble(String value) {
        try { return value == null || value.trim().isEmpty() ? null : Double.valueOf(value.trim()); }
        catch (Exception e) { return null; }
    }
}
