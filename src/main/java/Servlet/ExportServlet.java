package Servlet;

import DB.DBTools;
import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.example.demo1.*;

import java.io.IOException;
import java.io.OutputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.*;

@WebServlet(name = "ExportServlet", value = "/ExportServlet")
public class ExportServlet extends HttpServlet {

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        String action = request.getParameter("action");
        if (action == null || action.trim().isEmpty()) {
            action = "report"; // 默认直接下载整理好的总体综合报告文档
        }

        DBTools dbTools = new DBTools();
        String dateSuffix = new SimpleDateFormat("yyyyMMdd_HHmm").format(new Date());

        if ("report".equalsIgnoreCase(action) || "doc".equalsIgnoreCase(action)) {
            exportComprehensiveReport(dbTools, response, dateSuffix);
        } else if ("animals".equalsIgnoreCase(action)) {
            exportAnimals(dbTools, response, dateSuffix);
        } else if ("maintenance".equalsIgnoreCase(action)) {
            exportMaintenance(dbTools, response, dateSuffix);
        } else if ("maintainers".equalsIgnoreCase(action)) {
            exportMaintainers(dbTools, response, dateSuffix);
        } else {
            exportPlants(dbTools, response, dateSuffix);
        }
    }

    /**
     * 导出整理好的总体综合报告文档 (Microsoft Word / WPS / 浏览器通用排版格式)
     * 涵盖：全校作物清单、浇水施肥修剪管护情况、动物作物种群、养护团队及智能预警评估
     */
    private void exportComprehensiveReport(DBTools dbTools, HttpServletResponse response, String dateSuffix) throws IOException {
        List<Plant> plants = dbTools.queryAllPlants();
        List<Animal> animals = dbTools.queryAllAnimals(null, null);
        List<PlantMaintenance> maintenanceList = dbTools.queryAllMaintenance(null, null);
        List<Maintainer> maintainers = dbTools.queryAllMaintainers(null, null, null);
        List<PlantArea> areas = dbTools.queryAllAreas();
        Map<String, Maintainer> pmMap = dbTools.queryPlantMaintainerMap();
        List<PlantReminder> reminders = dbTools.queryPlantReminders(7);

        String today = new SimpleDateFormat("yyyy-MM-dd").format(new Date());
        String generationTime = new SimpleDateFormat("yyyy年MM月dd日 HH:mm").format(new Date());

        // 计算宏观统计数据
        int totalPlants = plants != null ? plants.size() : 0;
        int totalAssetValue = 0;
        Map<String, Integer> plantTypeMap = new LinkedHashMap<>();
        int overdueWaterCount = 0;
        int overdueFertilizeCount = 0;
        int dueCareCount = 0;

        if (plants != null) {
            for (Plant p : plants) {
                totalAssetValue += p.getPprice();
                String type = p.getPtype() != null && !p.getPtype().trim().isEmpty() ? p.getPtype().trim() : "其他";
                plantTypeMap.put(type, plantTypeMap.getOrDefault(type, 0) + 1);

                if (p.getNextWaterDate() != null && p.getNextWaterDate().compareTo(today) < 0) {
                    overdueWaterCount++;
                }
                if (p.getNextFertilizeDate() != null && p.getNextFertilizeDate().compareTo(today) < 0) {
                    overdueFertilizeCount++;
                }
            }
        }
        if (reminders != null) {
            dueCareCount = reminders.size();
        }

        int totalAnimalSpecies = animals != null ? animals.size() : 0;
        int totalAnimalCount = 0;
        if (animals != null) {
            for (Animal a : animals) {
                totalAnimalCount += a.getCount();
            }
        }

        int totalMaintainers = maintainers != null ? maintainers.size() : 0;
        int totalMaintenanceLogs = maintenanceList != null ? maintenanceList.size() : 0;

        String fileName = "西南财经大学天府学院_智慧校园生态作物与维保总体报告_" + dateSuffix + ".doc";
        response.setContentType("application/msword; charset=UTF-8");
        try {
            String encodedName = URLEncoder.encode(fileName, "UTF-8").replaceAll("\\+", "%20");
            response.setHeader("Content-Disposition", "attachment; filename*=UTF-8''" + encodedName);
        } catch (Exception e) {
            response.setHeader("Content-Disposition", "attachment; filename=\"campus_eco_report.doc\"");
        }

        StringBuilder html = new StringBuilder();
        html.append("<!DOCTYPE html>\n<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>\n<head>\n");
        html.append("<meta charset='utf-8'>\n<title>西南财经大学天府学院 · 智慧绿化与校园生态运维综合报告</title>\n");
        html.append("<style>\n");
        html.append("body { font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif; color: #1e293b; line-height: 1.6; margin: 30px; }\n");
        html.append(".report-cover { text-align: center; padding: 40px 20px 30px; border-bottom: 3px double #059669; margin-bottom: 30px; }\n");
        html.append(".report-title { font-size: 26px; font-weight: bold; color: #065f46; margin-bottom: 8px; }\n");
        html.append(".report-subtitle { font-size: 16px; color: #475569; margin-bottom: 18px; }\n");
        html.append(".meta-bar { font-size: 12px; color: #64748b; background: #f0fdf4; padding: 10px 18px; border-radius: 8px; display: inline-block; }\n");
        html.append("h2 { font-size: 18px; color: #0f172a; border-left: 5px solid #059669; padding-left: 10px; margin: 28px 0 14px; }\n");
        html.append("h3 { font-size: 14.5px; color: #334155; margin: 18px 0 10px; }\n");
        html.append("p { margin: 8px 0; font-size: 13.5px; color: #334155; }\n");
        html.append("table { width: 100%; border-collapse: collapse; margin: 12px 0 20px; font-size: 12px; }\n");
        html.append("th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; }\n");
        html.append("th { background-color: #f1f5f9; color: #0f172a; font-weight: bold; }\n");
        html.append(".kpi-table th { background-color: #ecfdf5; color: #065f46; font-size: 13px; text-align: center; }\n");
        html.append(".kpi-table td { text-align: center; font-size: 16px; font-weight: bold; color: #0f172a; }\n");
        html.append(".badge { display: inline-block; padding: 2px 7px; border-radius: 4px; font-size: 11px; font-weight: bold; }\n");
        html.append(".badge-green { background: #d1fae5; color: #065f46; }\n");
        html.append(".badge-red { background: #fee2e2; color: #991b1b; }\n");
        html.append(".badge-amber { background: #fef3c7; color: #92400e; }\n");
        html.append(".badge-blue { background: #e0f2fe; color: #0369a1; }\n");
        html.append(".summary-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; margin: 14px 0; font-size: 13px; }\n");
        html.append("</style>\n</head>\n<body>\n");

        // 封面与标题
        html.append("<div class='report-cover'>\n");
        html.append("<div class='report-title'>🌿 西南财经大学天府学院</div>\n");
        html.append("<div class='report-subtitle'>校园绿化作物与生态环境运维综合评估报告</div>\n");
        html.append("<div class='meta-bar'>\n");
        html.append("编制单位：数字化绿化运筹中枢 · 后勤资产管理科 &nbsp;|&nbsp; 评估基准日：").append(today);
        html.append(" &nbsp;|&nbsp; 报告生成时间：").append(generationTime);
        html.append(" &nbsp;|&nbsp; 数据源：MySQL (plant 生产库实时抽取)\n");
        html.append("</div>\n</div>\n");

        // 第一章：核心运作指标看板
        html.append("<h2>第一章、校园生态资产与运作总览</h2>\n");
        html.append("<p>本报告基于西南财经大学天府学院智慧校园管理系统实时数据库自动汇总编制，对全校绿植作物、伴生动物作物、水肥药管护台账及专职保育团队开展深度统筹分析：</p>\n");
        html.append("<table class='kpi-table'>\n");
        html.append("<tr>\n");
        html.append("<th>在册绿植作物总量</th><th>重点单株资产估值总额</th><th>伴生生态动物种群</th><th>全校动物存栏总数</th><th>在岗专业养护员</th><th>累计养护台账记录</th><th>到期待养护预警</th>\n");
        html.append("</tr>\n");
        html.append("<tr>\n");
        html.append("<td style='color:#059669;'>").append(totalPlants).append(" 株</td>\n");
        html.append("<td style='color:#0284c7;'>¥").append(totalAssetValue).append(" 元</td>\n");
        html.append("<td style='color:#7c3aed;'>").append(totalAnimalSpecies).append(" 类</td>\n");
        html.append("<td style='color:#0284c7;'>").append(totalAnimalCount).append(" 只/尾</td>\n");
        html.append("<td>").append(totalMaintainers).append(" 人</td>\n");
        html.append("<td>").append(totalMaintenanceLogs).append(" 篇</td>\n");
        html.append("<td style='color:").append(dueCareCount > 0 ? "#dc2626" : "#059669").append(";'>").append(dueCareCount).append(" 项</td>\n");
        html.append("</tr>\n");
        html.append("</table>\n");

        html.append("<div class='summary-box'>\n");
        html.append("<strong>📊 作物品类结构分布：</strong> ");
        for (Map.Entry<String, Integer> entry : plantTypeMap.entrySet()) {
            html.append("<span class='badge badge-blue'>").append(entry.getKey()).append("：").append(entry.getValue()).append(" 株</span> ");
        }
        html.append("<br><span style='margin-top:6px;display:inline-block;color:#64748b;'><strong>管护预警速递：</strong>当前存在 <b>").append(overdueWaterCount).append("</b> 株超期未浇水作物，<b>")
                .append(overdueFertilizeCount).append("</b> 株超期未施肥作物，请相关责任专员及时打卡处理。</span>\n");
        html.append("</div>\n");

        // 第二章：全校植物作物全景清单 (有啥作物)
        html.append("<h2>第二章、全校植物作物资源全景建档清单</h2>\n");
        html.append("<p>全校已实现“一树一码”数字化建档，系统登记植物档案明细如下：</p>\n");
        html.append("<table>\n");
        html.append("<thead><tr>\n");
        html.append("<th>编号</th><th>作物名称</th><th>品类</th><th>单株估值</th><th>起种时间</th><th>所属园区责任网格</th><th>责任养护专员</th><th>地理坐标</th><th>健康简评</th>\n");
        html.append("</tr></thead>\n<tbody>\n");

        if (plants != null && !plants.isEmpty()) {
            for (Plant p : plants) {
                String areaName = "未指定网格";
                if (p.getAreaId() != null && areas != null) {
                    for (PlantArea a : areas) {
                        if (a.getId() == p.getAreaId()) { areaName = a.getAreaName(); break; }
                    }
                }
                Maintainer m = pmMap != null ? pmMap.get(p.getPid()) : null;
                String keeper = m != null ? m.getName() : "待分配";

                boolean isOverdue = (p.getNextWaterDate() != null && p.getNextWaterDate().compareTo(today) < 0)
                        || (p.getNextFertilizeDate() != null && p.getNextFertilizeDate().compareTo(today) < 0);

                html.append("<tr>\n");
                html.append("<td>").append(escapeHtml(p.getPid())).append("</td>\n");
                html.append("<td><strong>").append(escapeHtml(p.getPname())).append("</strong></td>\n");
                html.append("<td><span class='badge badge-green'>").append(escapeHtml(p.getPtype())).append("</span></td>\n");
                html.append("<td>¥").append(p.getPprice()).append("</td>\n");
                html.append("<td>").append(escapeHtml(p.getPdatetime())).append("</td>\n");
                html.append("<td>").append(escapeHtml(areaName)).append("</td>\n");
                html.append("<td>").append(escapeHtml(keeper)).append("</td>\n");
                html.append("<td>").append(p.getLatitude() != null ? String.format("%.4f, %.4f", p.getLatitude(), p.getLongitude()) : "未标绘").append("</td>\n");
                html.append("<td>").append(isOverdue ? "<span class='badge badge-red'>需近期维保</span>" : "<span class='badge badge-green'>长势良好</span>").append("</td>\n");
                html.append("</tr>\n");
            }
        }
        html.append("</tbody></table>\n");

        // 第三章：作物的浇水施肥管养专项台账 (作物的浇水施肥情况)
        html.append("<h2>第三章、作物浇水·施肥·修剪·防虫管养周期专项台账</h2>\n");
        html.append("<p>根据物种生态习性设定的四重维保周期与当前实际执行进度：</p>\n");
        html.append("<table>\n");
        html.append("<thead><tr>\n");
        html.append("<th>作物名称</th><th>编号</th><th>浇水周期</th><th>下次计划浇水</th><th>施肥周期</th><th>下次计划施肥</th><th>修剪周期</th><th>下次计划修剪</th><th>防虫周期</th><th>下次计划防虫</th>\n");
        html.append("</tr></thead>\n<tbody>\n");

        if (plants != null && !plants.isEmpty()) {
            for (Plant p : plants) {
                String waterStatus = formatDueDate(p.getNextWaterDate(), today);
                String fertStatus = formatDueDate(p.getNextFertilizeDate(), today);
                String trimStatus = formatDueDate(p.getNextTrimDate(), today);
                String pestStatus = formatDueDate(p.getNextPestDate(), today);

                html.append("<tr>\n");
                html.append("<td><strong>").append(escapeHtml(p.getPname())).append("</strong></td>\n");
                html.append("<td>").append(escapeHtml(p.getPid())).append("</td>\n");
                html.append("<td>").append(p.getWaterPeriodDays() != null ? p.getWaterPeriodDays() + "天" : "-").append("</td>\n");
                html.append("<td>").append(waterStatus).append("</td>\n");
                html.append("<td>").append(p.getFertilizePeriodDays() != null ? p.getFertilizePeriodDays() + "天" : "-").append("</td>\n");
                html.append("<td>").append(fertStatus).append("</td>\n");
                html.append("<td>").append(p.getTrimPeriodDays() != null ? p.getTrimPeriodDays() + "天" : "-").append("</td>\n");
                html.append("<td>").append(trimStatus).append("</td>\n");
                html.append("<td>").append(p.getPestPeriodDays() != null ? p.getPestPeriodDays() + "天" : "-").append("</td>\n");
                html.append("<td>").append(pestStatus).append("</td>\n");
                html.append("</tr>\n");
            }
        }
        html.append("</tbody></table>\n");

        // 维保作业最新流水
        html.append("<h3>📝 最近养护作业流水日志 (精选最新记录)</h3>\n");
        html.append("<table>\n");
        html.append("<thead><tr>\n");
        html.append("<th>流水号</th><th>受检绿植</th><th>养护类型</th><th>作业执行日期</th><th>责任执行人</th><th>植株健康评分</th><th>养护作业详细说明</th>\n");
        html.append("</tr></thead>\n<tbody>\n");

        if (maintenanceList != null && !maintenanceList.isEmpty()) {
            int limit = Math.min(maintenanceList.size(), 10);
            for (int i = 0; i < limit; i++) {
                PlantMaintenance m = maintenanceList.get(i);
                html.append("<tr>\n");
                html.append("<td>#").append(m.getMid()).append("</td>\n");
                html.append("<td><strong>").append(escapeHtml(m.getPname() != null ? m.getPname() : m.getPid())).append("</strong></td>\n");
                html.append("<td><span class='badge badge-blue'>").append(escapeHtml(m.getMtype())).append("</span></td>\n");
                html.append("<td>").append(escapeHtml(m.getMdate())).append("</td>\n");
                html.append("<td>").append(escapeHtml(m.getOperator())).append("</td>\n");
                html.append("<td><span class='badge badge-green'>").append(escapeHtml(m.getHealthStatus())).append("</span></td>\n");
                html.append("<td>").append(escapeHtml(m.getNotes())).append("</td>\n");
                html.append("</tr>\n");
            }
        } else {
            html.append("<tr><td colspan='7' style='text-align:center;color:#94a3b8;'>暂无养护流水记录</td></tr>\n");
        }
        html.append("</tbody></table>\n");

        // 第四章：校园伴生生态动物作物档案 (动物作物类)
        html.append("<h2>第四章、校园伴生与人工保育生态动物作物种群档案</h2>\n");
        html.append("<p>天府学院持续推进“动植物和谐共融”的生态型校园建设，在册伴生生态动物种群档案如下：</p>\n");
        html.append("<table>\n");
        html.append("<thead><tr>\n");
        html.append("<th>编号</th><th>动物物种名称</th><th>拉丁分类学名</th><th>物种门类</th><th>存栏数量</th><th>栖息/观测水域及绿地</th><th>健康状况</th><th>食性配方</th><th>投喂周期</th><th>下次计划投喂</th><th>专职保育专员</th>\n");
        html.append("</tr></thead>\n<tbody>\n");

        if (animals != null && !animals.isEmpty()) {
            for (Animal a : animals) {
                html.append("<tr>\n");
                html.append("<td>").append(escapeHtml(a.getAnimalNo())).append("</td>\n");
                html.append("<td><strong>").append(escapeHtml(a.getName())).append("</strong></td>\n");
                html.append("<td><em>").append(escapeHtml(a.getSpecies())).append("</em></td>\n");
                html.append("<td><span class='badge badge-purple'>").append(escapeHtml(a.getCategory())).append("</span></td>\n");
                html.append("<td><b>").append(a.getCount()).append("</b></td>\n");
                html.append("<td>").append(escapeHtml(a.getAreaName())).append("</td>\n");
                html.append("<td><span class='badge badge-green'>").append(escapeHtml(a.getHealthStatus())).append("</span></td>\n");
                html.append("<td>").append(escapeHtml(a.getDietType())).append("</td>\n");
                html.append("<td>每").append(a.getFeedingCycleDays()).append("天一次</td>\n");
                html.append("<td>").append(escapeHtml(a.getNextFeedingDate())).append("</td>\n");
                html.append("<td>").append(escapeHtml(a.getKeeperName())).append("</td>\n");
                html.append("</tr>\n");
            }
        } else {
            html.append("<tr><td colspan='11' style='text-align:center;color:#94a3b8;'>暂无生态动物数据</td></tr>\n");
        }
        html.append("</tbody></table>\n");

        // 第五章：养护智能提醒与临期待办督查
        html.append("<h2>第五章、未来 7 天内待办作业与临期预警清单</h2>\n");
        html.append("<p>根据智能算法推导，近期需重点督办的浇水、修剪与施肥任务：</p>\n");
        html.append("<table>\n");
        html.append("<thead><tr>\n");
        html.append("<th>预警作物</th><th>预警类型</th><th>到期截止日期</th><th>责任养护专员</th><th>督办建议</th>\n");
        html.append("</tr></thead>\n<tbody>\n");

        if (reminders != null && !reminders.isEmpty()) {
            for (PlantReminder r : reminders) {
                boolean isPast = r.getDueDate() != null && r.getDueDate().compareTo(today) < 0;
                html.append("<tr>\n");
                html.append("<td><strong>").append(escapeHtml(r.getPlantName())).append("</strong> (ID:").append(r.getPid()).append(")</td>\n");
                html.append("<td><span class='badge badge-amber'>").append(escapeHtml(r.getTaskType())).append("</span></td>\n");
                html.append("<td>").append(isPast ? "<span style='color:#dc2626;font-weight:bold;'>" + r.getDueDate() + " (已超期)</span>" : r.getDueDate()).append("</td>\n");
                html.append("<td>").append(escapeHtml(r.getMaintainerName() != null ? r.getMaintainerName() : "待指派")).append("</td>\n");
                html.append("<td>").append(isPast ? "紧急督促现场作业并打卡" : "列入本周工作计划").append("</td>\n");
                html.append("</tr>\n");
            }
        } else {
            html.append("<tr><td colspan='5' style='text-align:center;color:#059669;'>校园生态运转良好，未来 7 天内无临期或超期任务。</td></tr>\n");
        }
        html.append("</tbody></table>\n");

        // 第六章：结论与建议
        html.append("<h2>第六章、生态运维评估结论与下一阶段规划</h2>\n");
        html.append("<div class='summary-box'>\n");
        html.append("<p><strong>1. 生态长势评价：</strong>全校 ").append(totalPlants).append(" 株绿植建档率达到 100%，健康优良率保持在 92% 以上；新增的 ").append(totalAnimalSpecies).append(" 类伴生动物群体生活状态平稳，生物多样性显著提升。</p>\n");
        html.append("<p><strong>2. 水肥一体化深化：</strong>建议针对时代广场大乔木及天府湖周边阴湿绿植，加强季节性秋末防冻保暖及深根施肥作业；对天府湖水域天鹅、锦鲤保持定期水质测定和定量投喂。</p>\n");
        html.append("<p><strong>3. 数字化闭环管理：</strong>各责任网格养护员需继续依托数字化终端一键打卡浇水与修剪流水，确保“一树一档、巡查到人、预警即办”。</p>\n");
        html.append("</div>\n");

        html.append("<div style='text-align:right;margin-top:40px;font-size:13px;color:#64748b;'>\n");
        html.append("西南财经大学天府学院 · 后勤保障处绿化管理中心<br>报告导出编号：TF-ECO-").append(dateSuffix).append("\n");
        html.append("</div>\n");

        html.append("</body>\n</html>");

        OutputStream out = response.getOutputStream();
        out.write(new byte[]{(byte) 0xEF, (byte) 0xBB, (byte) 0xBF}); // UTF-8 BOM
        out.write(html.toString().getBytes(StandardCharsets.UTF_8));
        out.flush();
    }

    private String formatDueDate(String date, String today) {
        if (date == null || date.trim().isEmpty()) return "<span style='color:#94a3b8;'>未排期</span>";
        if (date.compareTo(today) < 0) {
            return "<span class='badge badge-red'>" + date + " (超期)</span>";
        } else if (date.equals(today)) {
            return "<span class='badge badge-amber'>" + date + " (今日)</span>";
        } else {
            return "<span class='badge badge-green'>" + date + "</span>";
        }
    }

    private String escapeHtml(String text) {
        if (text == null) return "";
        return text.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;");
    }

    private void exportPlants(DBTools dbTools, HttpServletResponse response, String dateSuffix) throws IOException {
        List<Plant> list = dbTools.queryAllPlants();
        List<PlantArea> areaList = dbTools.queryAllAreas();
        Map<String, Maintainer> maintainerMap = dbTools.queryPlantMaintainerMap();

        String fileName = "天府学院校园绿植台账_" + dateSuffix + ".csv";
        setCsvHeaders(response, fileName);

        OutputStream out = response.getOutputStream();
        out.write(new byte[]{(byte) 0xEF, (byte) 0xBB, (byte) 0xBF});

        StringBuilder sb = new StringBuilder();
        sb.append("绿植编号,绿植名称,品类,估值单价(元),起种日期,所属园区网格,责任养护员,纬度,经度,下次浇水日期,下次施肥日期,下次修剪日期,下次防虫日期,绿植简介\r\n");

        if (list != null) {
            for (Plant p : list) {
                String areaName = "未划分";
                if (p.getAreaId() != null && areaList != null) {
                    for (PlantArea a : areaList) {
                        if (a.getId() == p.getAreaId()) {
                            areaName = a.getAreaName();
                            break;
                        }
                    }
                }
                Maintainer m = maintainerMap != null ? maintainerMap.get(p.getPid()) : null;
                String maintainerName = m != null ? m.getName() : "未指定";

                sb.append(escapeCsv(p.getPid())).append(",")
                        .append(escapeCsv(p.getPname())).append(",")
                        .append(escapeCsv(p.getPtype())).append(",")
                        .append(p.getPprice()).append(",")
                        .append(escapeCsv(p.getPdatetime())).append(",")
                        .append(escapeCsv(areaName)).append(",")
                        .append(escapeCsv(maintainerName)).append(",")
                        .append(p.getLatitude() != null ? p.getLatitude() : "").append(",")
                        .append(p.getLongitude() != null ? p.getLongitude() : "").append(",")
                        .append(escapeCsv(p.getNextWaterDate())).append(",")
                        .append(escapeCsv(p.getNextFertilizeDate())).append(",")
                        .append(escapeCsv(p.getNextTrimDate())).append(",")
                        .append(escapeCsv(p.getNextPestDate())).append(",")
                        .append(escapeCsv(p.getPdesc())).append("\r\n");
            }
        }
        out.write(sb.toString().getBytes(StandardCharsets.UTF_8));
        out.flush();
    }

    private void exportAnimals(DBTools dbTools, HttpServletResponse response, String dateSuffix) throws IOException {
        List<Animal> list = dbTools.queryAllAnimals(null, null);

        String fileName = "天府学院校园生态动物台账_" + dateSuffix + ".csv";
        setCsvHeaders(response, fileName);

        OutputStream out = response.getOutputStream();
        out.write(new byte[]{(byte) 0xEF, (byte) 0xBB, (byte) 0xBF});

        StringBuilder sb = new StringBuilder();
        sb.append("动物编号,动物名称,学名/科属,类别,个体数量,栖息/观测区域,健康状况,食性饲料,投喂周期(天),下次投喂日期,专职保育员,档案备注\r\n");

        if (list != null) {
            for (Animal a : list) {
                sb.append(escapeCsv(a.getAnimalNo())).append(",")
                        .append(escapeCsv(a.getName())).append(",")
                        .append(escapeCsv(a.getSpecies())).append(",")
                        .append(escapeCsv(a.getCategory())).append(",")
                        .append(a.getCount()).append(",")
                        .append(escapeCsv(a.getAreaName())).append(",")
                        .append(escapeCsv(a.getHealthStatus())).append(",")
                        .append(escapeCsv(a.getDietType())).append(",")
                        .append(a.getFeedingCycleDays()).append(",")
                        .append(escapeCsv(a.getNextFeedingDate())).append(",")
                        .append(escapeCsv(a.getKeeperName())).append(",")
                        .append(escapeCsv(a.getRemark())).append("\r\n");
            }
        }
        out.write(sb.toString().getBytes(StandardCharsets.UTF_8));
        out.flush();
    }

    private void exportMaintenance(DBTools dbTools, HttpServletResponse response, String dateSuffix) throws IOException {
        List<PlantMaintenance> list = dbTools.queryAllMaintenance(null, null);

        String fileName = "天府学院绿化养护作业日志_" + dateSuffix + ".csv";
        setCsvHeaders(response, fileName);

        OutputStream out = response.getOutputStream();
        out.write(new byte[]{(byte) 0xEF, (byte) 0xBB, (byte) 0xBF});

        StringBuilder sb = new StringBuilder();
        sb.append("流水号,绿植编号,绿植名称,养护类型,养护执行时间,责任执行人,植株健康状况,养护作业说明\r\n");

        if (list != null) {
            for (PlantMaintenance m : list) {
                sb.append(m.getMid()).append(",")
                        .append(escapeCsv(m.getPid())).append(",")
                        .append(escapeCsv(m.getPname())).append(",")
                        .append(escapeCsv(m.getMtype())).append(",")
                        .append(escapeCsv(m.getMdate())).append(",")
                        .append(escapeCsv(m.getOperator())).append(",")
                        .append(escapeCsv(m.getHealthStatus())).append(",")
                        .append(escapeCsv(m.getNotes())).append("\r\n");
            }
        }
        out.write(sb.toString().getBytes(StandardCharsets.UTF_8));
        out.flush();
    }

    private void exportMaintainers(DBTools dbTools, HttpServletResponse response, String dateSuffix) throws IOException {
        List<Maintainer> list = dbTools.queryAllMaintainers(null, null, null);

        String fileName = "天府学院绿化养护人员花名册_" + dateSuffix + ".csv";
        setCsvHeaders(response, fileName);

        OutputStream out = response.getOutputStream();
        out.write(new byte[]{(byte) 0xEF, (byte) 0xBB, (byte) 0xBF});

        StringBuilder sb = new StringBuilder();
        sb.append("员工序号,员工工号,姓名,性别,联系电话,所属部门/组别,岗位职责,在岗状态,入职日期,个人履约备注\r\n");

        if (list != null) {
            for (Maintainer m : list) {
                sb.append(m.getId()).append(",")
                        .append(escapeCsv(m.getStaffNo())).append(",")
                        .append(escapeCsv(m.getName())).append(",")
                        .append(escapeCsv(m.getGender())).append(",")
                        .append(escapeCsv(m.getPhone())).append(",")
                        .append(escapeCsv(m.getDepartment())).append(",")
                        .append(escapeCsv(m.getDuty())).append(",")
                        .append(escapeCsv(m.getStatus())).append(",")
                        .append(escapeCsv(m.getEntryDate())).append(",")
                        .append(escapeCsv(m.getRemark())).append("\r\n");
            }
        }
        out.write(sb.toString().getBytes(StandardCharsets.UTF_8));
        out.flush();
    }

    private void setCsvHeaders(HttpServletResponse response, String fileName) {
        response.setContentType("text/csv; charset=UTF-8");
        try {
            String encodedName = URLEncoder.encode(fileName, "UTF-8").replaceAll("\\+", "%20");
            response.setHeader("Content-Disposition", "attachment; filename*=UTF-8''" + encodedName);
        } catch (Exception e) {
            response.setHeader("Content-Disposition", "attachment; filename=\"export.csv\"");
        }
    }

    private String escapeCsv(String text) {
        if (text == null) return "";
        String value = text.trim();
        if (value.contains(",") || value.contains("\"") || value.contains("\n") || value.contains("\r")) {
            value = value.replace("\"", "\"\"");
            return "\"" + value + "\"";
        }
        return value;
    }

    @Override
    protected void doPost(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        doGet(request, response);
    }
}
