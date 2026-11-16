package DB;

import org.example.demo1.Plant;
import org.example.demo1.PlantMaintenance;
import org.example.demo1.mapper.PlantMaintenanceMapper;
import org.example.demo1.mapper.PlantMapper;
import org.example.demo1.mapper.SchemaMapper;
import security.SecurityUtils;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;

/**
 * 数据库初始化与绿植养护台账（MyBatis）。
 * <ul>
 *   <li>{@link #ensureSchema()}：全新库首次使用时建 plant / plant_type / plant_maintenance / maintainer / plant_area /
 *       maintainer_plant / admin_user / system_notice / animal 表并写入样例数据（只补不改；账号登录接口首次调用时触发）；</li>
 *   <li>{@link #recordPlantCare}：养护工作台给绿植档案（plant）记一次养护时，同步写原养护台账 plant_maintenance 并顺延下次日期。</li>
 * </ul>
 * 旧版管理系统（绿植档案 / 维护记录 / 养护团队等页面）已删除，相关查询方法一并移除；数据表全部保留。
 */
public class DBTools {

    private static volatile boolean tablesInitialized = false;

    public DBTools() {
        ensureSchema();
    }

    /**
     * 首次使用时建表 + 写入样例数据（只补不改）。连不上库时不标记完成，下次再试。
     * 账号登录 / 人脸 / 养护 / 大屏接口首次访问数据库时（{@link JdbcAccountStore#open()}）会调用这里，
     * 所以全新库不需要再像旧版那样先打开某个页面来触发建表。
     */
    public static void ensureSchema() {
        if (tablesInitialized) return;
        synchronized (DBTools.class) {
            if (!tablesInitialized && initTables()) tablesInitialized = true;
        }
    }

    public void initAllTables() {
        initTables();
    }

    private static boolean initTables() {
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
                    // 演示账号（初始密码 123456，部署后请在“账号管理”里修改）。INSERT IGNORE：已存在的账号不改密码 / 角色 / 状态
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
            return true;
        } catch (Exception | LinkageError e) {
            System.err.println("MyBatis 数据库表结构与种子数据初始化提示: " + e.getMessage());
            return false;
        }
    }

    // ================== 绿植养护台账 ==================

    public Plant queryPlantById(String pid) {
        return MyBatisUtil.apply(PlantMapper.class, mapper -> mapper.selectPlantById(pid));
    }

    public void addMaintenance(PlantMaintenance m) {
        MyBatisUtil.accept(PlantMaintenanceMapper.class, mapper -> mapper.insertMaintenance(m));
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
}
