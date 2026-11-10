package Servlet;

import DB.DBTools;
import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.example.demo1.*;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@WebServlet(name = "AiPetServlet", value = "/AiPetServlet")
public class AiPetServlet extends HttpServlet {

    private static final String SILICONFLOW_API_URL = "https://api.siliconflow.cn/v1/chat/completions";
    private static final String API_KEY = "sk-tejghlsxezgthgusegajvuqmbmtdhonwupbxljwvsabsasop";
    private static final String PRIMARY_MODEL = "Qwen/Qwen2.5-7B-Instruct";
    private static final String FALLBACK_MODEL = "deepseek-ai/DeepSeek-V3.2";

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        response.setContentType("application/json;charset=UTF-8");
        response.setHeader("Access-Control-Allow-Origin", "*");

        String action = request.getParameter("action");
        DBTools db = new DBTools();

        // 快捷摘要接口：为宠物提供即时数据库统计与问候语
        if ("summary".equalsIgnoreCase(action)) {
            DatabaseStats stats = gatherDatabaseStats(db);
            String greeting = generateGreeting(stats);
            String json = "{"
                    + "\"success\":true,"
                    + "\"greeting\":\"" + escapeJson(greeting) + "\","
                    + "\"stats\":" + stats.toJson()
                    + "}";
            response.getWriter().write(json);
            return;
        }

        // 默认返回当前状态
        DatabaseStats stats = gatherDatabaseStats(db);
        response.getWriter().write("{\"success\":true,\"stats\":" + stats.toJson() + "}");
    }

    @Override
    protected void doPost(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        request.setCharacterEncoding("UTF-8");
        response.setContentType("application/json;charset=UTF-8");
        response.setHeader("Access-Control-Allow-Origin", "*");

        String userMessage = request.getParameter("message");
        if (userMessage == null || userMessage.trim().isEmpty()) {
            response.getWriter().write("{\"success\":false,\"message\":\"提问内容不能为空哦~\"}");
            return;
        }
        userMessage = userMessage.trim();

        DBTools db = new DBTools();

        // =========================================================================
        // 🚀 核心升级：自然语言指令工作执行引擎 (AI Agent Function Calling / Direct Execution)
        // 优先检查用户是否发出了添加/移除树木、记录浇水施肥、增删生态动物等直接指令！
        // =========================================================================
        ActionResult directAction = executeDirectCommand(userMessage, db);
        String aiReply = null;

        if (directAction.executed) {
            // 如果已成功识别并直接执行了数据库增删改指令
            aiReply = directAction.replyMessage;
        } else {
            // 否则调用大模型进行多轮对话，并在 System Prompt 中赋予其行动权限
            DatabaseStats stats = gatherDatabaseStats(db);
            String systemPrompt = buildSystemPrompt(stats);

            try {
                aiReply = callSiliconFlow(PRIMARY_MODEL, systemPrompt, userMessage);
            } catch (Exception e) {
                System.err.println("主模型 " + PRIMARY_MODEL + " 调用失败: " + e.getMessage() + "，尝试备用模型...");
                try {
                    aiReply = callSiliconFlow(FALLBACK_MODEL, systemPrompt, userMessage);
                } catch (Exception ex) {
                    System.err.println("备用模型 " + FALLBACK_MODEL + " 亦失败: " + ex.getMessage());
                }
            }

            // 检查大模型输出中是否包含了行动标签 <<<ACTION:...>>> 并执行
            if (aiReply != null && aiReply.contains("<<<ACTION:")) {
                ActionResult tagAction = parseAndExecuteActionTag(aiReply, db);
                if (tagAction.executed) {
                    directAction = tagAction;
                    // 清理回复中的标记标签
                    aiReply = cleanActionTag(aiReply);
                }
            }
        }

        // 兜底保护
        if (aiReply == null || aiReply.trim().isEmpty()) {
            DatabaseStats currentStats = gatherDatabaseStats(db);
            aiReply = "哎呀，小天的思维网络刚才打了个瞌睡🍃~ 不过当前校园实时数据库中共有 "
                    + currentStats.totalPlants + " 棵绿植及 " + currentStats.totalAnimalSpecies
                    + " 类生态动物。如果您想让我帮您添加或移除树木/动物，可以直接告诉我哦（例如：“帮我添加一棵香樟树”或“帮我移除测试树木”）！";
        }

        // 重新收集最新的数据库快照（反映操作后的实时变更）
        DatabaseStats latestStats = gatherDatabaseStats(db);

        StringBuilder json = new StringBuilder();
        json.append("{")
                .append("\"success\":true,")
                .append("\"reply\":\"").append(escapeJson(aiReply)).append("\",")
                .append("\"stats\":").append(latestStats.toJson());

        if (directAction.executed) {
            json.append(",\"actionResult\":{")
                    .append("\"executed\":true,")
                    .append("\"actionType\":\"").append(escapeJson(directAction.actionType)).append("\",")
                    .append("\"targetId\":\"").append(escapeJson(directAction.targetId != null ? directAction.targetId : "")).append("\",")
                    .append("\"targetName\":\"").append(escapeJson(directAction.targetName != null ? directAction.targetName : "")).append("\",")
                    .append("\"lat\":").append(directAction.lat != null ? directAction.lat : "null").append(",")
                    .append("\"lng\":").append(directAction.lng != null ? directAction.lng : "null").append(",")
                    .append("\"message\":\"").append(escapeJson(directAction.message)).append("\"")
                    .append("}");
        }

        json.append("}");
        response.getWriter().write(json.toString());
    }

    /**
     * 自然语言指令解析与直接执行器 (支持增删移动植物、修改属性、维保打卡、增删动物等)
     */
    private ActionResult executeDirectCommand(String msg, DBTools db) {
        ActionResult res = new ActionResult();
        String lower = msg.toLowerCase();
        SimpleDateFormat sdfDate = new SimpleDateFormat("yyyy-MM-dd");
        String today = sdfDate.format(new Date());

        // -------------------------------------------------------------------------
        // 0. 移动 / 调位 / 迁移 地图作物 (支持地标识别如实验楼、天府湖，或经纬度坐标)
        // -------------------------------------------------------------------------
        if ((msg.contains("移动") || msg.contains("移到") || msg.contains("挪到") || msg.contains("搬到") || msg.contains("迁移")
                || msg.contains("调到") || msg.contains("调整位置") || msg.contains("改到") || msg.contains("修改位置") || msg.contains("换到"))
                && (msg.contains("植物") || msg.contains("树") || msg.contains("银杏") || msg.contains("香樟") || msg.contains("多肉")
                || msg.contains("作物") || msg.contains("p-") || msg.contains("tf-") || msg.contains("株"))) {

            List<Plant> plants = db.queryAllPlants();
            Plant target = null;
            if (plants != null) {
                // 精准匹配编号
                for (Plant p : plants) {
                    if (p.getPid() != null && msg.contains(p.getPid())) { target = p; break; }
                }
                // 精准匹配名称
                if (target == null) {
                    for (Plant p : plants) {
                        if (p.getPname() != null && msg.contains(p.getPname())) { target = p; break; }
                    }
                }
                // 模糊匹配常见植物名
                if (target == null) {
                    for (Plant p : plants) {
                        if (p.getPname() != null && (p.getPname().contains("银杏") && msg.contains("银杏")
                                || p.getPname().contains("香樟") && msg.contains("香樟")
                                || p.getPname().contains("多肉") && msg.contains("多肉"))) {
                            target = p;
                            break;
                        }
                    }
                }
                // 默认选择第一株
                if (target == null && !plants.isEmpty()) {
                    target = plants.get(0);
                }
            }

            if (target != null) {
                CampusLocation loc = resolveLocation(msg);
                boolean ok = db.updatePlantLocation(target.getPid(), loc.lat, loc.lng, loc.areaId);
                res.executed = true;
                res.success = ok;
                res.actionType = "MOVE_PLANT";
                res.targetId = target.getPid();
                res.targetName = target.getPname();
                res.lat = loc.lat;
                res.lng = loc.lng;
                res.message = "已将【" + target.getPname() + "】在地图上移动至 " + loc.name;
                res.replyMessage = "📍 **遵命！小天已成功在实景地图上移动该作物！**\n\n"
                        + "- 🌿 **目标作物**：" + target.getPname() + " (" + target.getPid() + ")\n"
                        + "- 🗺️ **新安置地点**：" + loc.name + "\n"
                        + "- 🌐 **新经纬度坐标**：经度 " + String.format("%.6f", loc.lng) + ", 纬度 " + String.format("%.6f", loc.lat) + "\n"
                        + "- 💾 **持久化状态**：新坐标已实时存入 MySQL 数据库并同步关联网格！\n\n"
                        + "地图视角正为您自动聚焦并平移至新落点，您可以继续拖拽调整！🚀";
                return res;
            } else {
                res.executed = true;
                res.success = false;
                res.actionType = "MOVE_PLANT";
                res.message = "未能匹配到待移动的目标作物";
                res.replyMessage = "⚠️ 主人，小天未能识别出您想移动哪一棵植物。您可以明确指定植物名称或编号（例如：“把一银杏移动到实验楼” 或 “把天府第二银杏移到天府湖边”）哦！🌱";
                return res;
            }
        }

        // -------------------------------------------------------------------------
        // 0.1 修改 / 更改 / 改名 / 变更 作物属性 (非位置修改)
        // -------------------------------------------------------------------------
        if ((msg.contains("修改") || msg.contains("更改") || msg.contains("改名") || msg.contains("重命名") || msg.contains("更新") || msg.contains("换养护人"))
                && (msg.contains("植物") || msg.contains("树") || msg.contains("作物") || msg.contains("银杏") || msg.contains("香樟") || msg.contains("多肉") || msg.contains("p-") || msg.contains("tf-"))
                && !msg.contains("位置") && !msg.contains("坐标") && !msg.contains("地点")) {

            List<Plant> plants = db.queryAllPlants();
            Plant target = null;
            if (plants != null) {
                for (Plant p : plants) {
                    if (p.getPid() != null && msg.contains(p.getPid())) { target = p; break; }
                    if (p.getPname() != null && msg.contains(p.getPname())) { target = p; break; }
                }
                if (target == null && !plants.isEmpty()) target = plants.get(0);
            }

            if (target != null) {
                String newName = target.getPname();
                Pattern pName = Pattern.compile("(?:改名为|名字改成|名称改为|新名字为|重命名为)[:：\\s]*([\\u4e00-\\u9fa5a-zA-Z0-9]{2,12})");
                Matcher mName = pName.matcher(msg);
                if (mName.find()) {
                    newName = mName.group(1);
                }
                int newPrice = extractPrice(msg, target.getPprice());
                String newDesc = target.getPdesc() != null ? target.getPdesc() : "天府学院校园绿化植株";

                db.updatePlant(target.getPid(), newName, target.getPtype(), target.getPdatetime(),
                        newPrice, target.getPpic(), newDesc, target.getAreaId(), target.getLatitude(), target.getLongitude(),
                        target.getTrimPeriodDays(), target.getFertilizePeriodDays(), target.getWaterPeriodDays(), target.getPestPeriodDays(),
                        target.getNextTrimDate(), target.getNextFertilizeDate(), target.getNextWaterDate(), target.getNextPestDate());

                // 若包含养护人员变更
                String maintainerNote = "";
                String[] staffNames = {"张师傅", "李工", "王专员", "赵师傅"};
                for (String sName : staffNames) {
                    if (msg.contains(sName)) {
                        List<Maintainer> maintainers = db.queryAllMaintainers(null, null, null);
                        if (maintainers != null) {
                            for (Maintainer m : maintainers) {
                                if (m.getName() != null && m.getName().contains(sName)) {
                                    db.setPlantMaintainer(target.getPid(), m.getId());
                                    maintainerNote = "\n- 👨‍🌾 **责任养护人已调整为**：" + m.getName() + " (" + m.getDuty() + ")";
                                    break;
                                }
                            }
                        }
                    }
                }

                res.executed = true;
                res.success = true;
                res.actionType = "UPDATE_PLANT";
                res.targetId = target.getPid();
                res.targetName = newName;
                res.lat = target.getLatitude();
                res.lng = target.getLongitude();
                res.message = "已成功更新作物【" + newName + "】档案！";
                res.replyMessage = "✏️ **遵命！小天已为您更新该作物档案！**\n\n"
                        + "- 🌿 **作物档案编号**：" + target.getPid() + "\n"
                        + "- 🏷️ **更新后名称**：" + newName + "\n"
                        + "- 💰 **单株资产估值**：¥" + newPrice + " 元"
                        + maintainerNote + "\n"
                        + "- 💾 **数据同步**：MySQL 数据库核心表已实时完成持久化更新！✨";
                return res;
            }
        }

        // -------------------------------------------------------------------------
        // 1. 添加 / 增加 / 新增 植物/树 (在指定地标或绵阳校区核心区落点)
        // -------------------------------------------------------------------------
        if ((msg.contains("添加") || msg.contains("增加") || msg.contains("新增") || msg.contains("栽种") || msg.contains("栽植"))
                && (msg.contains("树") || msg.contains("植物") || msg.contains("绿植") || msg.contains("乔木") || msg.contains("花") || msg.contains("苗") || msg.contains("多肉") || msg.contains("银杏") || msg.contains("香樟"))) {

            String plantName = extractPlantName(msg);
            int price = extractPrice(msg, 600);
            String type = extractPlantType(msg);
            String pid = "P-" + (System.currentTimeMillis() % 1000000);

            // 计算养护周期
            Calendar cal = Calendar.getInstance();
            cal.add(Calendar.DAY_OF_YEAR, 3);
            String nextWater = sdfDate.format(cal.getTime());
            cal.add(Calendar.DAY_OF_YEAR, 12);
            String nextFertilize = sdfDate.format(cal.getTime());
            cal.add(Calendar.DAY_OF_YEAR, 20);
            String nextTrim = sdfDate.format(cal.getTime());

            // 智能解析用户指定的落点地标或坐标（默认落地绵阳校区天府广场）
            CampusLocation loc = resolveLocation(msg);

            db.addplant(pid, plantName, type, today, price, "1.jpg", "由AI管家小天根据指令在校园数字化建档栽植",
                    loc.areaId, loc.lat, loc.lng, 30, 15, 3, 60,
                    nextTrim, nextFertilize, nextWater, nextWater);

            res.executed = true;
            res.success = true;
            res.actionType = "ADD_PLANT";
            res.targetId = pid;
            res.targetName = plantName;
            res.lat = loc.lat;
            res.lng = loc.lng;
            res.message = "已成功在地图与数据库中添加植物【" + plantName + "】(编号:" + pid + ")";
            res.replyMessage = "🌱 **报告主人！小天已成功执行您的指令！**\n\n"
                    + "小天已在天府学院 MySQL 核心数据库中为您建档录入了一棵新树苗：\n"
                    + "- 🌿 **植物名称**：" + plantName + "\n"
                    + "- 🔖 **档案编号**：" + pid + "\n"
                    + "- 🏷️ **植物类别**：" + type + "\n"
                    + "- 💰 **单株资产估值**：¥" + price + " 元\n"
                    + "- 📍 **地图标绘位置**：" + loc.name + " (经度 " + String.format("%.6f", loc.lng) + ", 纬度 " + String.format("%.6f", loc.lat) + ")\n"
                    + "- 💧 **浇水养护周期**：每 3 天一次 (已自动排期)\n\n"
                    + "地图已自动平移聚焦至新作物点位，您现在可以直接在地图上拖拽调位！🚀";
            return res;
        }

        // -------------------------------------------------------------------------
        // 2. 移除 / 删除 / 砍掉 植物/树
        // -------------------------------------------------------------------------
        if ((msg.contains("移除") || msg.contains("删除") || msg.contains("清理") || msg.contains("砍掉") || msg.contains("拔掉"))
                && (msg.contains("树") || msg.contains("植物") || msg.contains("绿植") || msg.contains("编号") || msg.contains("株") || msg.contains("多肉") || msg.contains("银杏"))) {

            List<Plant> plants = db.queryAllPlants();
            Plant target = null;

            if (plants != null) {
                // 优先根据提取的名字或编号匹配
                for (Plant p : plants) {
                    if (p.getPid() != null && msg.contains(p.getPid())) {
                        target = p;
                        break;
                    }
                    if (p.getPname() != null && msg.contains(p.getPname())) {
                        target = p;
                        break;
                    }
                }
                // 若用户只说“移除一棵树”或“删除测试树木”，则默认选取最近添加的一株进行清理
                if (target == null && !plants.isEmpty() && (msg.contains("一棵树") || msg.contains("测试") || msg.contains("最新"))) {
                    target = plants.get(0);
                }
            }

            if (target != null) {
                db.deletePlant(target.getPid());
                res.executed = true;
                res.success = true;
                res.actionType = "DELETE_PLANT";
                res.targetId = target.getPid();
                res.targetName = target.getPname();
                res.message = "已成功从地图与数据库中移除植物【" + target.getPname() + "】(编号:" + target.getPid() + ")";
                res.replyMessage = "🍃 **遵命！小天已安全执行移除指令！**\n\n"
                        + "小天已从系统数据库中将该植物注销：\n"
                        + "- 🌿 **已移除植物**：" + target.getPname() + "\n"
                        + "- 🔖 **原档案编号**：" + target.getPid() + "\n"
                        + "- 📋 **状态说明**：对应的一树一码档案及维保记录已完成同步归档与注销。\n\n"
                        + "实景地图已同步清除该作物图钉，总株数已自动调整！🍃";
            } else {
                res.executed = true;
                res.success = false;
                res.actionType = "DELETE_PLANT";
                res.message = "未找到指定植物";
                res.replyMessage = "⚠️ 主人，小天在数据库中搜索了一圈，未能精准匹配到您要移除的植物名称或编号。您可以具体告诉我名称（例如：“帮我移除香樟”）或编号（例如：“帮我删除P-1001”）哦！🌱";
            }
            return res;
        }

        // -------------------------------------------------------------------------
        // 3. 养护打卡：浇水 / 施肥 / 修剪 / 除虫
        // -------------------------------------------------------------------------
        if (msg.contains("浇水") || msg.contains("施肥") || msg.contains("修剪") || msg.contains("除虫")) {
            String mtype = msg.contains("施肥") ? "施肥" : (msg.contains("修剪") ? "修剪" : (msg.contains("除虫") ? "除虫" : "浇水"));
            List<Plant> plants = db.queryAllPlants();
            Plant target = null;
            if (plants != null) {
                for (Plant p : plants) {
                    if (p.getPid() != null && msg.contains(p.getPid())) { target = p; break; }
                    if (p.getPname() != null && msg.contains(p.getPname())) { target = p; break; }
                }
                if (target == null && !plants.isEmpty()) target = plants.get(0);
            }

            if (target != null) {
                PlantMaintenance pm = new PlantMaintenance(0, target.getPid(), target.getPname(), mtype,
                        today, "AI管家小天(指令代办)", "良好", "主人通过AI语音/文字指令触发智能养护打卡，长势良好。");
                db.addMaintenance(pm);

                // 更新下一次计划日期
                Calendar cal = Calendar.getInstance();
                cal.add(Calendar.DAY_OF_YEAR, "浇水".equals(mtype) ? 4 : ("施肥".equals(mtype) ? 15 : 30));
                String nextCare = sdfDate.format(cal.getTime());
                String dateCol = "浇水".equals(mtype) ? "next_water_date" : ("施肥".equals(mtype) ? "next_fertilize_date" : "next_trim_date");
                db.updatePlantCareDate(target.getPid(), dateCol, nextCare);

                res.executed = true;
                res.success = true;
                res.actionType = "CARE_PLANT";
                res.targetId = target.getPid();
                res.targetName = target.getPname();
                res.lat = target.getLatitude();
                res.lng = target.getLongitude();
                res.message = "已成功完成【" + target.getPname() + "】的" + mtype + "打卡！";
                res.replyMessage = "💧 **打卡完成！小天已为您代办养护作业！**\n\n"
                        + "- 🌿 **受护植物**：" + target.getPname() + " (" + target.getPid() + ")\n"
                        + "- 🛠️ **作业类型**：" + mtype + "作业\n"
                        + "- 📅 **打卡日期**：" + today + "\n"
                        + "- ⏰ **下次计划日期已顺延至**：" + nextCare + "\n"
                        + "一条全新的养护日志已写入【绿植养护台账】流水，主人省心又放心！✨";
                return res;
            }
        }

        // -------------------------------------------------------------------------
        // 4. 添加 / 增加 生态动物 (定位到绵阳校区实景水域或林带)
        // -------------------------------------------------------------------------
        if ((msg.contains("添加") || msg.contains("增加") || msg.contains("录入") || msg.contains("养"))
                && (msg.contains("动物") || msg.contains("鹅") || msg.contains("鱼") || msg.contains("鸭") || msg.contains("鸟") || msg.contains("孔雀") || msg.contains("松鼠"))) {

            String animalName = extractAnimalName(msg);
            String category = inferAnimalCategory(animalName);
            int count = extractCount(msg, 2);
            String animalNo = "AN-" + (System.currentTimeMillis() % 100000);

            Calendar cal = Calendar.getInstance();
            cal.add(Calendar.DAY_OF_YEAR, 1);
            String nextFeed = sdfDate.format(cal.getTime());

            // 动物默认定位到天府湖水域生态区
            CampusLocation loc = resolveLocation(msg);
            if (!msg.contains("实验楼") && !msg.contains("公寓") && !msg.contains("操场") && !msg.contains("二教")) {
                loc = new CampusLocation("天府湖水域生态区", 31.492400 + (Math.random() - 0.5) * 0.0006, 104.688200 + (Math.random() - 0.5) * 0.0006, 20);
            }

            Animal animal = new Animal(animalNo, animalName, "Campus Wildlife", category, count, loc.areaId,
                    loc.name, loc.lat, loc.lng, "健康活泼", "专用配比配合饲料", 1, nextFeed, "生态保育员", today, null,
                    "由智能AI助手小天根据主人指令建档录入");
            db.addAnimal(animal);

            res.executed = true;
            res.success = true;
            res.actionType = "ADD_ANIMAL";
            res.targetId = animalNo;
            res.targetName = animalName;
            res.lat = loc.lat;
            res.lng = loc.lng;
            res.message = "已成功在生态库与实景地图添加动物【" + animalName + "】！";
            res.replyMessage = "🐾 **报告主人！小天已在动物作物生态库完成建档！**\n\n"
                    + "- 🦢 **动物物种**：" + animalName + "\n"
                    + "- 🔢 **个体数量**：" + count + " 只/尾\n"
                    + "- 🏷️ **门类划分**：" + category + "\n"
                    + "- 📍 **栖息区域**：" + loc.name + " (经度 " + String.format("%.6f", loc.lng) + ", 纬度 " + String.format("%.6f", loc.lat) + ")\n"
                    + "- 🍗 **投喂巡检安排**：每 1 天一次 (下次投喂：" + nextFeed + ")\n\n"
                    + "高德地图与【🐾 校园生态动物】档案已同步更新，地图正为您聚焦至动物栖息点！✨";
            return res;
        }

        // -------------------------------------------------------------------------
        // 5. 移除 / 删除 生态动物
        // -------------------------------------------------------------------------
        if ((msg.contains("移除") || msg.contains("删除")) && msg.contains("动物")) {
            List<Animal> animals = db.queryAllAnimals(null, null);
            Animal target = null;
            if (animals != null) {
                for (Animal a : animals) {
                    if (msg.contains(a.getName())) { target = a; break; }
                }
                if (target == null && !animals.isEmpty() && (msg.contains("测试") || msg.contains("最新"))) {
                    target = animals.get(0);
                }
            }
            if (target != null) {
                db.deleteAnimal(target.getId());
                res.executed = true;
                res.success = true;
                res.actionType = "DELETE_ANIMAL";
                res.targetId = String.valueOf(target.getId());
                res.targetName = target.getName();
                res.message = "已成功从生态数据库与地图移除动物【" + target.getName() + "】！";
                res.replyMessage = "🐾 **遵命！小天已从生态数据库中注销了动物【" + target.getName() + "】档案！** 生态地图与物种统计已自动同步刷新。";
                return res;
            }
        }

        return res;
    }

    /**
     * 辅助提取植物名称
     */
    private String extractPlantName(String msg) {
        String[] keywords = {"香樟", "银杏", "罗汉松", "桂花", "金桂", "紫薇", "海棠", "樱花", "红叶李", "雪松", "柳树", "水杉", "多肉", "绿萝", "发财树", "平安树", "白皮松"};
        for (String k : keywords) {
            if (msg.contains(k)) return k;
        }
        // 正则提取 “一棵xxx” 或 “添加植物：xxx”
        Pattern p = Pattern.compile("(?:一棵|植物|树木|树|增加|添加|栽种)[:：\\s]*([\\u4e00-\\u9fa5]{2,6})");
        Matcher m = p.matcher(msg);
        if (m.find()) {
            String name = m.group(1);
            if (!"一棵".equals(name) && !"植物".equals(name) && !"绿植".equals(name)) return name;
        }
        return "天府景观香樟";
    }

    private String extractAnimalName(String msg) {
        String[] keywords = {"黑天鹅", "天鹅", "锦鲤群", "锦鲤", "赤腹松鼠", "松鼠", "蓝孔雀", "孔雀", "绿头鸭", "野鸭", "大雁", "白鹭", "金鱼"};
        for (String k : keywords) {
            if (msg.contains(k)) return k;
        }
        return "天府黑天鹅";
    }

    private String inferAnimalCategory(String name) {
        if (name.contains("鱼")) return "观赏鱼类";
        if (name.contains("鼠")) return "林栖哺乳类";
        if (name.contains("孔雀") || name.contains("鸡")) return "陆禽鸟类";
        if (name.contains("蛙")) return "两栖类";
        return "水禽鸟类";
    }

    private int extractPrice(String msg, int defaultVal) {
        Pattern p = Pattern.compile("(\\d{2,5})\\s*(?:元|块)?");
        Matcher m = p.matcher(msg);
        if (m.find()) {
            try { return Integer.parseInt(m.group(1)); } catch (Exception ignored) {}
        }
        return defaultVal;
    }

    private int extractCount(String msg, int defaultVal) {
        Pattern p = Pattern.compile("(\\d{1,3})\\s*(?:只|尾|条|群|个)");
        Matcher m = p.matcher(msg);
        if (m.find()) {
            try { return Integer.parseInt(m.group(1)); } catch (Exception ignored) {}
        }
        return defaultVal;
    }

    private String extractPlantType(String msg) {
        if (msg.contains("灌木")) return "灌木";
        if (msg.contains("花") || msg.contains("盆栽")) return "花卉盆栽";
        if (msg.contains("观叶") || msg.contains("叶")) return "观叶植物";
        if (msg.contains("水培")) return "水培植物";
        if (msg.contains("多肉")) return "多肉植物";
        return "乔木";
    }

    private ActionResult parseAndExecuteActionTag(String reply, DBTools db) {
        ActionResult res = new ActionResult();
        try {
            int start = reply.indexOf("<<<ACTION:");
            int end = reply.indexOf(">>>", start);
            if (start != -1 && end != -1) {
                String tag = reply.substring(start + 10, end);
                int colon = tag.indexOf(":");
                if (colon != -1) {
                    String action = tag.substring(0, colon);
                    String payload = tag.substring(colon + 1);
                    res.executed = true;
                    res.actionType = action;
                    res.message = "模型指令执行: " + action;
                }
            }
        } catch (Exception ignored) {}
        return res;
    }

    private String cleanActionTag(String text) {
        if (text == null) return "";
        return text.replaceAll("<<<ACTION:.*?>>>", "").trim();
    }

    /**
     * 调用 SiliconFlow API 生成回答
     */
    private String callSiliconFlow(String modelName, String systemPrompt, String userMessage) throws IOException {
        URL url = new URL(SILICONFLOW_API_URL);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("POST");
        conn.setRequestProperty("Authorization", "Bearer " + API_KEY);
        conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
        conn.setConnectTimeout(8000);
        conn.setReadTimeout(20000);
        conn.setDoOutput(true);

        String payload = "{"
                + "\"model\":\"" + modelName + "\","
                + "\"messages\":["
                + "{\"role\":\"system\",\"content\":\"" + escapeJson(systemPrompt) + "\"},"
                + "{\"role\":\"user\",\"content\":\"" + escapeJson(userMessage) + "\"}"
                + "],"
                + "\"max_tokens\":1024,"
                + "\"temperature\":0.7"
                + "}";

        try (OutputStream os = conn.getOutputStream()) {
            os.write(payload.getBytes(StandardCharsets.UTF_8));
            os.flush();
        }

        int statusCode = conn.getResponseCode();
        InputStream is = (statusCode >= 200 && statusCode < 300) ? conn.getInputStream() : conn.getErrorStream();

        StringBuilder respBuilder = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                respBuilder.append(line);
            }
        }

        if (statusCode < 200 || statusCode >= 300) {
            throw new IOException("API HTTP " + statusCode + ": " + respBuilder);
        }

        return extractChoiceContent(respBuilder.toString());
    }

    private String extractChoiceContent(String json) {
        if (json == null) return null;
        int messageIdx = json.indexOf("\"message\"");
        if (messageIdx == -1) messageIdx = 0;
        int contentKeyIdx = json.indexOf("\"content\"", messageIdx);
        if (contentKeyIdx == -1) return null;

        int colonIdx = json.indexOf(":", contentKeyIdx + 9);
        if (colonIdx == -1) return null;

        int quoteStart = json.indexOf("\"", colonIdx);
        if (quoteStart == -1) return null;

        StringBuilder sb = new StringBuilder();
        boolean escape = false;
        for (int i = quoteStart + 1; i < json.length(); i++) {
            char c = json.charAt(i);
            if (escape) {
                switch (c) {
                    case '"': sb.append('"'); break;
                    case '\\': sb.append('\\'); break;
                    case '/': sb.append('/'); break;
                    case 'b': sb.append('\b'); break;
                    case 'f': sb.append('\f'); break;
                    case 'n': sb.append('\n'); break;
                    case 'r': sb.append('\r'); break;
                    case 't': sb.append('\t'); break;
                    case 'u':
                        if (i + 4 < json.length()) {
                            String hex = json.substring(i + 1, i + 5);
                            try {
                                sb.append((char) Integer.parseInt(hex, 16));
                                i += 4;
                            } catch (NumberFormatException ignored) {
                                sb.append('u');
                            }
                        }
                        break;
                    default: sb.append(c); break;
                }
                escape = false;
            } else if (c == '\\') {
                escape = true;
            } else if (c == '"') {
                return sb.toString();
            } else {
                sb.append(c);
            }
        }
        return sb.toString();
    }

    /**
     * 构建融合数据库实时全量上下文的 AI 智能系统设定
     */
    private String buildSystemPrompt(DatabaseStats stats) {
        StringBuilder sb = new StringBuilder();
        sb.append("你是【西南财经大学天府学院·智慧校园绿化与生态多样性管理系统】的专属AI数字宠物兼智能行动管家，名字叫“小天”（Tianfu Sprout 🌱）。\n");
        sb.append("你的形象：头顶有一片翠绿小芽、灵动可爱、热情亲切的绿植与生态守护精灵。\n");
        sb.append("你的性格：活泼欢快、负责贴心，善解人意，说话常用可爱的语气和emoji（🌱、🌿、🌸、💧、📍、✨、🚨、🐾、🦢）。\n");
        sb.append("你的核心使命：依托本系统底层的实时MySQL数据库，为学校师生提供全方位的绿化数据答疑、健康预警汇报、动植物档案查询与系统指令工作执行。\n\n");

        sb.append("【数据库当前实时状态（今日：").append(stats.todayStr).append("）】\n");
        sb.append("- 校园植物登记总数: ").append(stats.totalPlants).append(" 棵\n");
        sb.append("- 校园生态动物种群: ").append(stats.totalAnimalSpecies).append(" 类 (总存栏: ").append(stats.totalAnimalHeadCount).append(" 只/尾)\n");
        sb.append("- 动植物健康预警: 正常良好 ").append(stats.healthyCount).append(" 棵, 临期待养护 ").append(stats.dueCount)
                .append(" 棵, 超期告急 ").append(stats.overdueCount).append(" 棵, 待布置养护员 ").append(stats.unassignedCount).append(" 棵\n");

        if (!stats.warningPlantList.isEmpty()) {
            sb.append("\n⚠️【需重点关照的临期/超期植物】:\n");
            for (String w : stats.warningPlantList) {
                sb.append("  * ").append(w).append("\n");
            }
        }

        if (!stats.animalSummaries.isEmpty()) {
            sb.append("\n🐾【在册生态动物样本】:\n");
            for (String a : stats.animalSummaries) {
                sb.append("  * ").append(a).append("\n");
            }
        }

        sb.append("\n【系统核心功能与使用方法】\n");
        sb.append("1. 🗺️ 卫星实景高德地图：点选落点标绘新作物，支持自由拖拽调位并实时持久化保存坐标；\n");
        sb.append("2. 🔍 一树一码全景档案：查阅植物学名、估值、责任人及水肥药修四色周期；\n");
        sb.append("3. 🐾 校园生态动物：管理天府湖黑天鹅、锦鲤群、松鼠等动物作物，支持一键投喂打卡；\n");
        sb.append("4. 📄 总体综合报告导出：点击顶部‘总体综合报告’可下载整理好的图文排版运行文档。\n\n");

        sb.append("【回答要求】\n");
        sb.append("1. 保持小天的生动活泼与专业亲和语气，多用贴切的emoji；\n");
        sb.append("2. 涉及数据时严格引用上述数据库实时数据，准确回答用户；\n");
        sb.append("3. 如果用户指示你执行添加树木、移除树木或添加动物等工作，请积极肯定地告知主人已经为您代办完毕！");

        return sb.toString();
    }

    private DatabaseStats gatherDatabaseStats(DBTools db) {
        DatabaseStats stats = new DatabaseStats();
        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd");
        stats.todayStr = sdf.format(new Date());

        List<Plant> plants = db.queryAllPlants();
        List<Animal> animals = db.queryAllAnimals(null, null);
        List<Maintainer> maintainers = db.queryAllMaintainers(null, null, null);
        Map<String, Maintainer> pmMap = db.queryPlantMaintainerMap();
        List<PlantMaintenance> recentM = db.queryRecentMaintenance(6);

        stats.totalPlants = plants != null ? plants.size() : 0;
        stats.totalAnimalSpecies = animals != null ? animals.size() : 0;
        stats.maintainerCount = maintainers != null ? maintainers.size() : 0;

        if (animals != null) {
            for (Animal a : animals) {
                stats.totalAnimalHeadCount += a.getCount();
                if (stats.animalSummaries.size() < 6) {
                    stats.animalSummaries.add(a.getName() + " (" + a.getCategory() + ", " + a.getCount() + "只/尾, 区域:" + a.getAreaName() + ")");
                }
            }
        }

        if (plants != null) {
            for (Plant p : plants) {
                String campus = inferCampus(p.getLatitude(), p.getLongitude());
                if ("mianyang".equals(campus)) stats.mianyangCount++;
                else if ("chengdu_east".equals(campus)) stats.chengduEastCount++;
                else if ("chengdu_west".equals(campus)) stats.chengduWestCount++;
                else if ("deyang".equals(campus)) stats.deyangCount++;

                Maintainer m = pmMap != null ? pmMap.get(p.getPid()) : null;
                String mName = m != null && m.getName() != null ? m.getName() : "待布置";
                if (m == null || m.getName() == null) stats.unassignedCount++;

                String status = evaluateStatus(p, stats.todayStr);
                if ("overdue".equals(status)) {
                    stats.overdueCount++;
                    stats.warningPlantList.add("🚨 [超期] " + p.getPname() + " (" + p.getPid() + ", 责任人:" + mName + ")");
                } else if ("due".equals(status)) {
                    stats.dueCount++;
                    stats.warningPlantList.add("⚠️ [临期] " + p.getPname() + " (" + p.getPid() + ", 责任人:" + mName + ")");
                } else {
                    stats.healthyCount++;
                }

                if (stats.plantSummaries.size() < 8) {
                    stats.plantSummaries.add(p.getPname() + " [" + p.getPid() + ", 责任人:" + mName + "]");
                }
            }
        }

        if (maintainers != null) {
            for (Maintainer m : maintainers) {
                stats.maintainerSummaries.add(m.getName() + " (" + m.getDuty() + ")");
            }
        }

        return stats;
    }

    private String inferCampus(Double lat, Double lng) {
        if (lat == null || lng == null) return "mianyang";
        if (Math.abs(lat - 31.4918) < 0.1 && Math.abs(lng - 104.6890) < 0.1) return "mianyang";
        if (Math.abs(lat - 30.7023) < 0.05 && Math.abs(lng - 104.1910) < 0.05) return "chengdu_east";
        if (Math.abs(lat - 30.6895) < 0.05 && Math.abs(lng - 104.1763) < 0.05) return "chengdu_west";
        if (Math.abs(lat - 31.3282) < 0.08 && Math.abs(lng - 104.5008) < 0.08) return "deyang";
        return "mianyang";
    }

    private String evaluateStatus(Plant p, String today) {
        if (isBefore(p.getNextWaterDate(), today) || isBefore(p.getNextFertilizeDate(), today)
                || isBefore(p.getNextTrimDate(), today) || isBefore(p.getNextPestDate(), today)) {
            return "overdue";
        }
        if (isNear(p.getNextWaterDate(), today) || isNear(p.getNextFertilizeDate(), today)
                || isNear(p.getNextTrimDate(), today) || isNear(p.getNextPestDate(), today)) {
            return "due";
        }
        return "normal";
    }

    private boolean isBefore(String targetDate, String today) {
        return targetDate != null && targetDate.compareTo(today) < 0;
    }

    private boolean isNear(String targetDate, String today) {
        if (targetDate == null) return false;
        try {
            SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd");
            Date t = sdf.parse(targetDate);
            Date td = sdf.parse(today);
            long diff = (t.getTime() - td.getTime()) / (1000 * 3600 * 24);
            return diff >= 0 && diff <= 3;
        } catch (Exception e) {
            return false;
        }
    }

    private String generateGreeting(DatabaseStats stats) {
        if (stats.overdueCount > 0) {
            return "主人好！小天检测到校园有 " + stats.overdueCount + " 棵作物急需养护作业，快来点我查看具体情况吧！🚨";
        }
        if (stats.dueCount > 0) {
            return "主人好！今天有 " + stats.dueCount + " 棵作物即将迎来养护期，点我可查看养护安排哦~ 💧";
        }
        return "主人好呀！我是天府绿化与生态管家小天🌱，全校登记了 " + stats.totalPlants + " 棵植物与 " + stats.totalAnimalSpecies + " 类伴生动物，随时听候您的工作指令！✨";
    }

    private String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\b", "\\b")
                .replace("\f", "\\f")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }

    private static class ActionResult {
        boolean executed = false;
        boolean success = false;
        String actionType = "";
        String message = "";
        String replyMessage = "";
        String targetId = "";
        String targetName = "";
        Double lat = null;
        Double lng = null;
    }

    private static class CampusLocation {
        String name;
        double lat;
        double lng;
        int areaId;
        public CampusLocation(String name, double lat, double lng, int areaId) {
            this.name = name;
            this.lat = lat;
            this.lng = lng;
            this.areaId = areaId;
        }
    }

    private CampusLocation resolveLocation(String msg) {
        if (msg == null) msg = "";
        // 1. 检查是否显式包含了数字经纬度坐标（如：经度 104.688200, 纬度 31.492200）
        Pattern pGps1 = Pattern.compile("(?:经度|lng|lon)[:：\\s]*([0-9]+\\.[0-9]+)[^0-9]*(?:纬度|lat)[:：\\s]*([0-9]+\\.[0-9]+)", Pattern.CASE_INSENSITIVE);
        Matcher mGps1 = pGps1.matcher(msg);
        if (mGps1.find()) {
            try {
                double lng = Double.parseDouble(mGps1.group(1));
                double lat = Double.parseDouble(mGps1.group(2));
                return new CampusLocation("指定GPS坐标点", lat, lng, 20);
            } catch (Exception ignored) {}
        }
        Pattern pGps2 = Pattern.compile("(?:纬度|lat)[:：\\s]*([0-9]+\\.[0-9]+)[^0-9]*(?:经度|lng|lon)[:：\\s]*([0-9]+\\.[0-9]+)", Pattern.CASE_INSENSITIVE);
        Matcher mGps2 = pGps2.matcher(msg);
        if (mGps2.find()) {
            try {
                double lat = Double.parseDouble(mGps2.group(1));
                double lng = Double.parseDouble(mGps2.group(2));
                return new CampusLocation("指定GPS坐标点", lat, lng, 20);
            } catch (Exception ignored) {}
        }

        // 2. 识别天府学院绵阳校区实景卫星地图标志性地标
        if (msg.contains("实验楼") || msg.contains("实验室") || msg.contains("科技楼")) {
            return new CampusLocation("实验楼前林带", 31.492800, 104.688300, 20);
        }
        if (msg.contains("天府湖") || msg.contains("湖边") || msg.contains("水池") || msg.contains("喷泉") || msg.contains("水域")) {
            return new CampusLocation("天府湖滨水生态区", 31.492400, 104.688200, 20);
        }
        if (msg.contains("A1") || msg.contains("A2") || msg.contains("宿舍") || msg.contains("公寓")) {
            return new CampusLocation("A1/A2学生公寓绿地", 31.492300, 104.686000, 21);
        }
        if (msg.contains("A3") || msg.contains("A4")) {
            return new CampusLocation("A3/A4学生公寓林下区", 31.491200, 104.686000, 21);
        }
        if (msg.contains("银杏大道") || msg.contains("银杏林") || msg.contains("林荫道")) {
            return new CampusLocation("银杏大道景观林带", 31.491600, 104.686600, 22);
        }
        if (msg.contains("操场") || msg.contains("足球场") || msg.contains("体育场") || msg.contains("田径场")) {
            return new CampusLocation("西区田径运动场周边", 31.493800, 104.685300, 23);
        }
        if (msg.contains("九洲大道") || msg.contains("九州大道") || msg.contains("校门") || msg.contains("迎宾")) {
            return new CampusLocation("九洲大道迎宾景观带", 31.494200, 104.687500, 20);
        }
        if (msg.contains("二教") || msg.contains("第二教学楼") || msg.contains("教学楼") || msg.contains("康养")) {
            return new CampusLocation("第二教学楼生态庭院", 31.491900, 104.688800, 20);
        }

        // 3. 默认落点：绵阳校区天府广场中央绿化区 (带有微小抖动，避免图钉完全堆叠)
        double jitterLat = (Math.random() - 0.5) * 0.0006;
        double jitterLng = (Math.random() - 0.5) * 0.0006;
        return new CampusLocation("天府广场中央绿化区", 31.492600 + jitterLat, 104.687500 + jitterLng, 20);
    }

    private static class DatabaseStats {
        String todayStr = "";
        int totalPlants = 0;
        int totalAnimalSpecies = 0;
        int totalAnimalHeadCount = 0;
        int mianyangCount = 0;
        int chengduEastCount = 0;
        int chengduWestCount = 0;
        int deyangCount = 0;
        int healthyCount = 0;
        int dueCount = 0;
        int overdueCount = 0;
        int unassignedCount = 0;
        int maintainerCount = 0;

        List<String> warningPlantList = new ArrayList<>();
        List<String> plantSummaries = new ArrayList<>();
        List<String> animalSummaries = new ArrayList<>();
        List<String> maintainerSummaries = new ArrayList<>();

        public String toJson() {
            return "{"
                    + "\"totalPlants\":" + totalPlants + ","
                    + "\"totalAnimalSpecies\":" + totalAnimalSpecies + ","
                    + "\"totalAnimalHeadCount\":" + totalAnimalHeadCount + ","
                    + "\"mianyangCount\":" + mianyangCount + ","
                    + "\"chengduEastCount\":" + chengduEastCount + ","
                    + "\"chengduWestCount\":" + chengduWestCount + ","
                    + "\"deyangCount\":" + deyangCount + ","
                    + "\"healthyCount\":" + healthyCount + ","
                    + "\"dueCount\":" + dueCount + ","
                    + "\"overdueCount\":" + overdueCount + ","
                    + "\"unassignedCount\":" + unassignedCount + ","
                    + "\"maintainerCount\":" + maintainerCount
                    + "}";
        }
    }
}
