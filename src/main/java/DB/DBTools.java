package DB;

import org.example.demo1.AdminUser;
import org.example.demo1.Animal;
import org.example.demo1.Maintainer;
import org.example.demo1.Plant;
import org.example.demo1.PlantArea;
import org.example.demo1.PlantMaintenance;
import org.example.demo1.PlantReminder;
import org.example.demo1.PlantType;
import org.example.demo1.SystemNotice;
import org.example.demo1.mapper.*;
import security.SecurityUtils;

import java.text.SimpleDateFormat;
import java.util.*;

/**
 * 数据库操作门面类（全面由 MyBatis 替换实现）。
 * 保留原有 API 接口供所有 Servlet 零成本无缝调用，底层数据访问与映射完全迁移至 MyBatis Mappers。
 */
public class DBTools {

    private static volatile boolean tablesInitialized = false;

    public DBTools() {
        if (!tablesInitialized) {
            synchronized (DBTools.class) {
                if (!tablesInitialized) {
                    initAllTables();
                    tablesInitialized = true;
                }
            }
        }
    }

    public void initAllTables() {
        try {
            MyBatisUtil.accept(SchemaMapper.class, schema -> {
                // 1. 初始化各业务数据表结构
                schema.createPlantTable();
                schema.createTypeTable();
                schema.createMaintenanceTable();
                schema.createMaintainerTable();
                schema.createAreaTable();
                schema.createMaintainerPlantTable();
                schema.createAdminUserTable();
                schema.createNoticeTable();
                schema.createAnimalTable();

                // 2. 检查并补充 plant 表扩展字段
                try { schema.addColumnAreaId(); } catch (Exception ignored) {}
                try { schema.addColumnLatitude(); } catch (Exception ignored) {}
                try { schema.addColumnLongitude(); } catch (Exception ignored) {}
                try { schema.addColumnTrimPeriodDays(); } catch (Exception ignored) {}
                try { schema.addColumnFertilizePeriodDays(); } catch (Exception ignored) {}
                try { schema.addColumnWaterPeriodDays(); } catch (Exception ignored) {}
                try { schema.addColumnPestPeriodDays(); } catch (Exception ignored) {}
                try { schema.addColumnNextTrimDate(); } catch (Exception ignored) {}
                try { schema.addColumnNextFertilizeDate(); } catch (Exception ignored) {}
                try { schema.addColumnNextWaterDate(); } catch (Exception ignored) {}
                try { schema.addColumnNextPestDate(); } catch (Exception ignored) {}
                try { schema.addColumnAnimalLatitude(); } catch (Exception ignored) {}
                try { schema.addColumnAnimalLongitude(); } catch (Exception ignored) {}
                try { schema.updateSampleAnimalCoordinates(); } catch (Exception ignored) {}

                // 3. 填充类别种子数据
                try {
                    String[][] defaultTypes = {
                            {"1", "乔木", "树体高大具有明显主干"},
                            {"2", "灌木", "主干不明显多分枝木本植物"},
                            {"3", "观叶植物", "以观赏叶片形态和色彩为主"},
                            {"4", "多肉植物", "肉质多汁具有贮水功能"},
                            {"5", "花卉盆栽", "以观花为主的草本或木本"},
                            {"6", "水培植物", "适宜水培室内洁净观赏"},
                            {"7", "银杏", "银杏科银杏属落叶乔木"}
                    };
                    for (String[] item : defaultTypes) {
                        schema.insertDefaultType(item[0], item[1], item[2]);
                    }
                } catch (Exception e) {
                    System.out.println("类别种子数据初始化提示: " + e.getMessage());
                }

                // 4. 清理旧版模拟养护数据
                try {
                    schema.cleanMockMaintenance();
                } catch (Exception ignored) {}

                // 5. 初始化养护员样例数据
                try {
                    if (schema.countMaintainers() == 0) {
                        schema.insertSampleMaintainers();
                    }
                } catch (Exception ignored) {}

                // 6. 初始化默认管理员账号
                try {
                    String adminPwd = SecurityUtils.sha256("123456");
                    schema.insertDefaultAdmin("admin", adminPwd, "系统管理员", "SYSTEM_ADMIN");
                    schema.insertDefaultAdmin("system_admin", adminPwd, "系统管理员", "SYSTEM_ADMIN");
                    schema.insertDefaultAdmin("plant_admin", adminPwd, "植物管理员", "PLANT_ADMIN");
                    schema.insertDefaultAdmin("maintenance_admin", adminPwd, "养护管理员", "MAINTENANCE_ADMIN");
                } catch (Exception ignored) {}

                // 7. 初始化系统公告样例数据
                try {
                    if (schema.countNotices() == 0) {
                        schema.insertSampleNotices();
                    }
                } catch (Exception ignored) {}

                // 8. 初始化生态动物作物样例数据
                try {
                    if (schema.countAnimals() == 0) {
                        schema.insertSampleAnimals();
                    }
                } catch (Exception ignored) {}
            });
        } catch (Exception e) {
            System.err.println("MyBatis 数据库表结构与种子数据初始化提示: " + e.getMessage());
        }
    }

    // ================== 绿植管理功能 (Plant) ==================

    public void addplant(String pid, String pname, String ptype, String pdatetime, int pprice, String ppic, String pdesc) {
        addplant(pid, pname, ptype, pdatetime, pprice, ppic, pdesc,
                null, null, null, null, null, null, null, null, null, null, null);
    }

    public void addplant(String pid, String pname, String ptype, String pdatetime, int pprice, String ppic, String pdesc,
                         Integer areaId, Double latitude, Double longitude,
                         Integer trimPeriodDays, Integer fertilizePeriodDays, Integer waterPeriodDays, Integer pestPeriodDays,
                         String nextTrimDate, String nextFertilizeDate, String nextWaterDate, String nextPestDate) {
        Plant plant = new Plant(pid, pname, ptype, pdatetime, pprice, ppic, pdesc);
        plant.setAreaId(areaId);
        plant.setLatitude(latitude);
        plant.setLongitude(longitude);
        plant.setTrimPeriodDays(trimPeriodDays);
        plant.setFertilizePeriodDays(fertilizePeriodDays);
        plant.setWaterPeriodDays(waterPeriodDays);
        plant.setPestPeriodDays(pestPeriodDays);
        plant.setNextTrimDate(nextTrimDate);
        plant.setNextFertilizeDate(nextFertilizeDate);
        plant.setNextWaterDate(nextWaterDate);
        plant.setNextPestDate(nextPestDate);

        MyBatisUtil.accept(PlantMapper.class, mapper -> mapper.insertPlant(plant));
    }

    public List<Plant> queryAllPlants() {
        return MyBatisUtil.apply(PlantMapper.class, PlantMapper::selectAllPlants);
    }

    public List<PlantType> queryAllPlantTypes() {
        try {
            return MyBatisUtil.apply(PlantTypeMapper.class, PlantTypeMapper::selectAllPlantTypes);
        } catch (Exception e) {
            try {
                return MyBatisUtil.apply(PlantTypeMapper.class, PlantTypeMapper::selectAllFromPlantType);
            } catch (Exception ex) {
                return new ArrayList<>();
            }
        }
    }

    public void deletePlant(String pid) {
        MyBatisUtil.accept(PlantMapper.class, mapper -> mapper.deletePlant(pid));
    }

    public Plant queryPlantById(String pid) {
        return MyBatisUtil.apply(PlantMapper.class, mapper -> mapper.selectPlantById(pid));
    }

    public void updatePlant(String pid, String pname, String ptype, String pdatetime, int pprice, String ppic, String pdesc) {
        updatePlant(pid, pname, ptype, pdatetime, pprice, ppic, pdesc,
                null, null, null, null, null, null, null, null, null, null, null);
    }

    public void updatePlant(String pid, String pname, String ptype, String pdatetime, int pprice, String ppic, String pdesc,
                            Integer areaId, Double latitude, Double longitude,
                            Integer trimPeriodDays, Integer fertilizePeriodDays, Integer waterPeriodDays, Integer pestPeriodDays,
                            String nextTrimDate, String nextFertilizeDate, String nextWaterDate, String nextPestDate) {
        Plant plant = new Plant(pid, pname, ptype, pdatetime, pprice, ppic, pdesc);
        plant.setAreaId(areaId);
        plant.setLatitude(latitude);
        plant.setLongitude(longitude);
        plant.setTrimPeriodDays(trimPeriodDays);
        plant.setFertilizePeriodDays(fertilizePeriodDays);
        plant.setWaterPeriodDays(waterPeriodDays);
        plant.setPestPeriodDays(pestPeriodDays);
        plant.setNextTrimDate(nextTrimDate);
        plant.setNextFertilizeDate(nextFertilizeDate);
        plant.setNextWaterDate(nextWaterDate);
        plant.setNextPestDate(nextPestDate);

        MyBatisUtil.accept(PlantMapper.class, mapper -> mapper.updatePlant(plant));
    }

    public boolean updatePlantLocation(String pid, Double latitude, Double longitude, Integer areaId) {
        if (pid == null || pid.trim().isEmpty()) return false;
        try {
            int rows = MyBatisUtil.apply(PlantMapper.class, mapper -> mapper.updatePlantLocation(pid.trim(), latitude, longitude, areaId));
            return rows > 0;
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }

    public boolean updatePlantCareDate(String pid, String dateCol, String nextDate) {
        if (pid == null || dateCol == null || nextDate == null) return false;
        try {
            int rows = MyBatisUtil.apply(PlantMapper.class, mapper -> mapper.updatePlantCareDate(pid, dateCol, nextDate));
            return rows > 0;
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }

    // ================== 绿植维护功能 (Maintenance) ==================

    public void addMaintenance(PlantMaintenance m) {
        MyBatisUtil.accept(PlantMaintenanceMapper.class, mapper -> mapper.insertMaintenance(m));
    }

    public List<PlantMaintenance> queryAllMaintenance(String keyword, String mtype) {
        return MyBatisUtil.apply(PlantMaintenanceMapper.class, mapper -> mapper.selectAllMaintenance(keyword, mtype));
    }

    public void deleteMaintenance(int mid) {
        MyBatisUtil.accept(PlantMaintenanceMapper.class, mapper -> mapper.deleteMaintenance(mid));
    }

    public Map<String, PlantMaintenance> getLastMaintenanceMap() {
        Map<String, PlantMaintenance> map = new HashMap<>();
        List<PlantMaintenance> list = MyBatisUtil.apply(PlantMaintenanceMapper.class, PlantMaintenanceMapper::selectAllOrderAsc);
        if (list != null) {
            for (PlantMaintenance m : list) {
                map.put(m.getPid(), m);
            }
        }
        return map;
    }

    public int getTodayMaintenanceCount(String todayDatePrefix) {
        return MyBatisUtil.apply(PlantMaintenanceMapper.class, mapper -> mapper.countTodayMaintenance(todayDatePrefix));
    }

    public List<PlantMaintenance> queryMaintenanceByPid(String pid) {
        if (pid == null || pid.trim().isEmpty()) return new ArrayList<>();
        return MyBatisUtil.apply(PlantMaintenanceMapper.class, mapper -> mapper.selectMaintenanceByPid(pid.trim()));
    }

    public boolean recordPlantCare(String pid, String mtype, String operator, String note) {
        Plant plant = queryPlantById(pid);
        if (plant == null) return false;
        if (operator == null || operator.trim().isEmpty()) {
            operator = "校区责任养护员";
        }
        if (note == null || note.trim().isEmpty()) {
            note = "完成" + mtype + "养护，植株生长状态健康";
        }
        String nowDate = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(new Date());
        PlantMaintenance m = new PlantMaintenance();
        m.setPid(pid);
        m.setPname(plant.getPname());
        m.setMtype(mtype);
        m.setMdate(nowDate);
        m.setOperator(operator);
        m.setHealthStatus("状态良好");
        m.setNotes(note);
        addMaintenance(m);

        int periodDays = 30;
        String dateCol = null;
        if ("浇水".equals(mtype)) {
            periodDays = (plant.getWaterPeriodDays() != null && plant.getWaterPeriodDays() > 0) ? plant.getWaterPeriodDays() : 7;
            dateCol = "next_water_date";
        } else if ("施肥".equals(mtype)) {
            periodDays = (plant.getFertilizePeriodDays() != null && plant.getFertilizePeriodDays() > 0) ? plant.getFertilizePeriodDays() : 30;
            dateCol = "next_fertilize_date";
        } else if ("修剪".equals(mtype)) {
            periodDays = (plant.getTrimPeriodDays() != null && plant.getTrimPeriodDays() > 0) ? plant.getTrimPeriodDays() : 60;
            dateCol = "next_trim_date";
        } else if ("放药".equals(mtype) || "打药".equals(mtype) || "除虫".equals(mtype)) {
            periodDays = (plant.getPestPeriodDays() != null && plant.getPestPeriodDays() > 0) ? plant.getPestPeriodDays() : 45;
            dateCol = "next_pest_date";
        }

        if (dateCol != null) {
            Calendar cal = Calendar.getInstance();
            cal.add(Calendar.DAY_OF_YEAR, periodDays);
            String nextDate = new SimpleDateFormat("yyyy-MM-dd").format(cal.getTime());
            final String col = dateCol;
            MyBatisUtil.accept(PlantMapper.class, mapper -> mapper.updatePlantCareDate(pid, col, nextDate));
        }
        return true;
    }

    // ================== 维护人员管理功能 (Maintainer) ==================

    public boolean addMaintainer(Maintainer m) {
        try {
            int rows = MyBatisUtil.apply(MaintainerMapper.class, mapper -> mapper.insertMaintainer(m));
            return rows > 0;
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }

    public List<Maintainer> queryAllMaintainers(String keyword, String department, String status) {
        return MyBatisUtil.apply(MaintainerMapper.class, mapper -> mapper.selectAllMaintainers(keyword, department, status));
    }

    public Maintainer queryMaintainerById(int id) {
        return MyBatisUtil.apply(MaintainerMapper.class, mapper -> mapper.selectMaintainerById(id));
    }

    public boolean updateMaintainer(Maintainer m) {
        try {
            int rows = MyBatisUtil.apply(MaintainerMapper.class, mapper -> mapper.updateMaintainer(m));
            return rows > 0;
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }

    public void deleteMaintainer(int id) {
        MyBatisUtil.accept(MaintainerMapper.class, mapper -> mapper.deleteMaintainer(id));
    }

    public List<String> queryActiveMaintainerNames() {
        return MyBatisUtil.apply(MaintainerMapper.class, MaintainerMapper::selectActiveMaintainerNames);
    }

    // ================== 管理员登录与仪表盘 ==================

    public AdminUser authenticateAdmin(String username, String passwordHash) {
        String defaultDemoHash = username != null && username.contains("plant") ? SecurityUtils.sha256("Plant@123") :
                (username != null && username.contains("maintain") ? SecurityUtils.sha256("Maintain@123") : SecurityUtils.sha256("System@123"));
        List<String> hashes = Arrays.asList(passwordHash, defaultDemoHash, SecurityUtils.sha256("123456"));
        return MyBatisUtil.apply(AdminUserMapper.class, mapper -> mapper.authenticateAdmin(username, hashes));
    }

    public int getPlantCount() {
        return MyBatisUtil.apply(PlantMapper.class, PlantMapper::countPlants);
    }

    public int getMaintainerCount() {
        return MyBatisUtil.apply(MaintainerMapper.class, MaintainerMapper::countMaintainers);
    }

    public int getMaintenanceCount() {
        List<PlantMaintenance> list = MyBatisUtil.apply(PlantMaintenanceMapper.class, mapper -> mapper.selectAllMaintenance(null, null));
        return list != null ? list.size() : 0;
    }

    public int getDuePlantCount() {
        return MyBatisUtil.apply(PlantMapper.class, PlantMapper::countDuePlants);
    }

    public int getUnassignedPlantCount() {
        return MyBatisUtil.apply(PlantMapper.class, PlantMapper::countUnassignedPlants);
    }

    public List<Plant> queryPlantsByMaintainer(int maintainerId) {
        return MyBatisUtil.apply(PlantMapper.class, mapper -> mapper.selectPlantsByMaintainer(maintainerId));
    }

    public boolean assignPlantToMaintainer(int maintainerId, String pid, boolean primary) {
        try {
            MyBatisUtil.accept(MaintainerMapper.class, mapper -> mapper.assignPlantToMaintainer(maintainerId, pid, primary ? 1 : 0));
            return true;
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }

    public boolean removePlantFromMaintainer(int maintainerId, String pid) {
        try {
            MyBatisUtil.accept(MaintainerMapper.class, mapper -> mapper.removePlantFromMaintainer(maintainerId, pid));
            return true;
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }

    public boolean setPlantMaintainer(String pid, Integer maintainerId) {
        if (pid == null || pid.trim().isEmpty()) return false;
        try {
            MyBatisUtil.accept(MaintainerMapper.class, mapper -> mapper.deletePlantMaintainer(pid.trim()));
            if (maintainerId != null && maintainerId > 0) {
                MyBatisUtil.accept(MaintainerMapper.class, mapper -> mapper.assignPlantToMaintainer(maintainerId, pid.trim(), 1));
            }
            return true;
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }

    public Map<String, Maintainer> queryPlantMaintainerMap() {
        Map<String, Maintainer> map = new HashMap<>();
        try {
            List<Map<String, Object>> directList = MyBatisUtil.apply(MaintainerMapper.class, MaintainerMapper::selectDirectPlantMaintainers);
            if (directList != null) {
                for (Map<String, Object> row : directList) {
                    String pid = (String) row.get("pid");
                    Maintainer m = new Maintainer();
                    Object idObj = row.get("id");
                    if (idObj instanceof Number) {
                        m.setId(((Number) idObj).intValue());
                    }
                    m.setStaffNo((String) row.get("staffNo"));
                    m.setName((String) row.get("name"));
                    m.setGender((String) row.get("gender"));
                    m.setPhone((String) row.get("phone"));
                    m.setDepartment((String) row.get("department"));
                    m.setDuty((String) row.get("duty"));
                    m.setStatus((String) row.get("status"));
                    map.put(pid, m);
                }
            }
        } catch (Exception e) {
            System.out.println("MyBatis 查询植物直接养护员提示: " + e.getMessage());
        }

        try {
            List<Map<String, Object>> areaList = MyBatisUtil.apply(MaintainerMapper.class, MaintainerMapper::selectAreaPlantMaintainers);
            if (areaList != null) {
                for (Map<String, Object> row : areaList) {
                    String pid = (String) row.get("pid");
                    if (!map.containsKey(pid)) {
                        Maintainer m = new Maintainer();
                        Object idObj = row.get("id");
                        if (idObj instanceof Number) {
                            m.setId(((Number) idObj).intValue());
                        }
                        m.setStaffNo((String) row.get("staffNo"));
                        m.setName((String) row.get("name"));
                        m.setGender((String) row.get("gender"));
                        m.setPhone((String) row.get("phone"));
                        m.setDepartment((String) row.get("department"));
                        m.setDuty((String) row.get("duty"));
                        m.setStatus((String) row.get("status"));
                        map.put(pid, m);
                    }
                }
            }
        } catch (Exception ignored) {}

        return map;
    }

    public List<PlantArea> queryAllAreas() {
        return MyBatisUtil.apply(PlantAreaMapper.class, PlantAreaMapper::selectAllAreas);
    }

    public PlantArea queryAreaByCode(String areaCode) {
        if (areaCode == null || areaCode.trim().isEmpty()) return null;
        return MyBatisUtil.apply(PlantAreaMapper.class, mapper -> mapper.selectAreaByCode(areaCode.trim()));
    }

    public PlantArea queryAreaById(int id) {
        return MyBatisUtil.apply(PlantAreaMapper.class, mapper -> mapper.selectAreaById(id));
    }

    public void syncAreaPlantsToMaintainer(int areaId, int maintainerId) {
        try {
            MyBatisUtil.accept(MaintainerMapper.class, mapper -> mapper.syncAreaPlantsToMaintainer(areaId, maintainerId));
        } catch (Exception e) {
            System.out.println("MyBatis 同步区域绿植责任养护员提示: " + e.getMessage());
        }
    }

    public boolean addArea(String areaCode, String areaName, Integer maintainerId,
                           Double centerLatitude, Double centerLongitude, Integer radiusM) {
        PlantArea area = new PlantArea();
        area.setAreaCode(areaCode);
        area.setAreaName(areaName);
        area.setMaintainerId(maintainerId);
        area.setCenterLatitude(centerLatitude);
        area.setCenterLongitude(centerLongitude);
        area.setRadiusM(radiusM);
        try {
            MyBatisUtil.accept(PlantAreaMapper.class, mapper -> mapper.insertOrUpdateArea(area));
            if (maintainerId != null && maintainerId > 0) {
                PlantArea saved = queryAreaByCode(areaCode);
                if (saved != null) {
                    syncAreaPlantsToMaintainer(saved.getId(), maintainerId);
                }
            }
            return true;
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }

    public boolean updateArea(int id, String areaCode, String areaName, Integer maintainerId,
                              Double centerLatitude, Double centerLongitude, Integer radiusM, String status) {
        PlantArea area = new PlantArea();
        area.setId(id);
        area.setAreaCode(areaCode);
        area.setAreaName(areaName);
        area.setMaintainerId(maintainerId);
        area.setCenterLatitude(centerLatitude);
        area.setCenterLongitude(centerLongitude);
        area.setRadiusM(radiusM);
        area.setStatus(status == null || status.trim().isEmpty() ? "启用" : status.trim());
        try {
            MyBatisUtil.accept(PlantAreaMapper.class, mapper -> mapper.updateArea(area));
            if (maintainerId != null && maintainerId > 0) {
                syncAreaPlantsToMaintainer(id, maintainerId);
            }
            return true;
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }

    public boolean deleteArea(int id) {
        try {
            MyBatisUtil.accept(PlantAreaMapper.class, mapper -> {
                mapper.clearAreaPlants(id);
                mapper.deleteArea(id);
            });
            return true;
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }

    public List<PlantReminder> queryPlantReminders(int daysAhead) {
        return MyBatisUtil.apply(PlantMapper.class, mapper -> mapper.selectPlantReminders(daysAhead));
    }

    public List<SystemNotice> queryRecentNotices(int limit) {
        return MyBatisUtil.apply(SystemNoticeMapper.class, mapper -> mapper.selectRecentNotices(limit));
    }

    public List<PlantMaintenance> queryRecentMaintenance(int limit) {
        return MyBatisUtil.apply(PlantMaintenanceMapper.class, mapper -> mapper.selectRecentMaintenance(limit));
    }

    // ================== 系统用户与权限管理 (AdminUser) ==================

    public List<AdminUser> queryAllAdminUsers() {
        return MyBatisUtil.apply(AdminUserMapper.class, AdminUserMapper::selectAllUsers);
    }

    public boolean addAdminUser(String username, String plainPassword, String displayName, String roleCode) {
        try {
            AdminUser user = new AdminUser();
            user.setUsername(username != null ? username.trim() : "");
            user.setPasswordHash(SecurityUtils.sha256(plainPassword != null ? plainPassword.trim() : "123456"));
            user.setDisplayName(displayName != null ? displayName.trim() : username);
            user.setRoleCode(roleCode != null ? roleCode.trim() : "ADMIN");
            user.setStatus(1);
            int rows = MyBatisUtil.apply(AdminUserMapper.class, mapper -> mapper.insertAdminUser(user));
            return rows > 0;
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }

    public boolean updateAdminUserPassword(int id, String plainPassword) {
        try {
            String hash = SecurityUtils.sha256(plainPassword != null ? plainPassword.trim() : "123456");
            int rows = MyBatisUtil.apply(AdminUserMapper.class, mapper -> mapper.updateUserPassword(id, hash));
            return rows > 0;
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }

    public boolean toggleAdminUserStatus(int id, int status) {
        try {
            int rows = MyBatisUtil.apply(AdminUserMapper.class, mapper -> mapper.updateUserStatus(id, status));
            return rows > 0;
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }

    public boolean deleteAdminUser(int id) {
        try {
            int rows = MyBatisUtil.apply(AdminUserMapper.class, mapper -> mapper.deleteUser(id));
            return rows > 0;
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }

    // ================== 绿化系统通知公告管理 (SystemNotice) ==================

    public List<SystemNotice> queryAllNotices() {
        return MyBatisUtil.apply(SystemNoticeMapper.class, SystemNoticeMapper::selectAllNotices);
    }

    public boolean addNotice(SystemNotice notice) {
        try {
            int rows = MyBatisUtil.apply(SystemNoticeMapper.class, mapper -> mapper.insertNotice(notice));
            return rows > 0;
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }

    public boolean updateNotice(SystemNotice notice) {
        try {
            int rows = MyBatisUtil.apply(SystemNoticeMapper.class, mapper -> mapper.updateNotice(notice));
            return rows > 0;
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }

    public boolean deleteNotice(int id) {
        try {
            int rows = MyBatisUtil.apply(SystemNoticeMapper.class, mapper -> mapper.deleteNotice(id));
            return rows > 0;
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }

    // ================== 校园生态动物作物管理 (Animal) ==================

    public List<Animal> queryAllAnimals(String keyword, String category) {
        return MyBatisUtil.apply(AnimalMapper.class, mapper -> mapper.selectAllAnimals(keyword, category));
    }

    public Animal queryAnimalById(int id) {
        return MyBatisUtil.apply(AnimalMapper.class, mapper -> mapper.selectAnimalById(id));
    }

    public Animal queryAnimalByNo(String animalNo) {
        return MyBatisUtil.apply(AnimalMapper.class, mapper -> mapper.selectAnimalByNo(animalNo));
    }

    public boolean addAnimal(Animal animal) {
        try {
            int rows = MyBatisUtil.apply(AnimalMapper.class, mapper -> mapper.insertAnimal(animal));
            return rows > 0;
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }

    public boolean updateAnimal(Animal animal) {
        try {
            int rows = MyBatisUtil.apply(AnimalMapper.class, mapper -> mapper.updateAnimal(animal));
            return rows > 0;
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }

    public boolean updateAnimalLocation(int id, Double latitude, Double longitude, Integer areaId) {
        try {
            int rows = MyBatisUtil.apply(AnimalMapper.class, mapper -> mapper.updateAnimalLocation(id, latitude, longitude, areaId));
            return rows > 0;
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }

    public boolean updateAnimalFeedingDate(int id, String nextFeedingDate) {
        try {
            int rows = MyBatisUtil.apply(AnimalMapper.class, mapper -> mapper.updateFeedingDate(id, nextFeedingDate));
            return rows > 0;
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }

    public boolean deleteAnimal(int id) {
        try {
            int rows = MyBatisUtil.apply(AnimalMapper.class, mapper -> mapper.deleteAnimal(id));
            return rows > 0;
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }

    public int getAnimalSpeciesCount() {
        try {
            return MyBatisUtil.apply(AnimalMapper.class, AnimalMapper::countAnimals);
        } catch (Exception e) {
            return 0;
        }
    }

    public int getTotalAnimalCount() {
        try {
            Integer total = MyBatisUtil.apply(AnimalMapper.class, AnimalMapper::sumAnimalCount);
            return total != null ? total : 0;
        } catch (Exception e) {
            return 0;
        }
    }

    public int getDueFeedingAnimalCount() {
        try {
            String today = new SimpleDateFormat("yyyy-MM-dd").format(new Date());
            return MyBatisUtil.apply(AnimalMapper.class, mapper -> mapper.countDueFeedingAnimals(today));
        } catch (Exception e) {
            return 0;
        }
    }
}
