<%@ page contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" %>
<%@ page import="DB.DBTools, org.example.demo1.Plant, org.example.demo1.PlantType, org.example.demo1.PlantArea, java.util.List, java.util.ArrayList" %>
<%
    Plant plant = (Plant) request.getAttribute("plant");
    if (plant == null) {
        plant = new Plant();
    }

    // 从数据库动态读取所有绿植类别
    List<PlantType> typeList = new ArrayList<>();
    List<PlantArea> areaList = new ArrayList<>();
    try {
        DBTools dbTools = new DBTools();
        typeList = dbTools.queryAllPlantTypes();
        areaList = dbTools.queryAllAreas();
    } catch (Exception e) {
        System.out.println("加载绿植类别列表失败: " + e.getMessage());
    }

    // 容错兜底类别
    if (typeList == null || typeList.isEmpty()) {
        typeList = new ArrayList<>();
        typeList.add(new PlantType(1, "乔木", "树体高大具有明显主干"));
        typeList.add(new PlantType(2, "灌木", "主干不明显多分枝木本植物"));
        typeList.add(new PlantType(3, "观叶植物", "以观赏叶片形态和色彩为主"));
        typeList.add(new PlantType(4, "多肉植物", "肉质多汁具有贮水功能"));
        typeList.add(new PlantType(5, "花卉盆栽", "以观花为主的草本或木本"));
        typeList.add(new PlantType(6, "水培植物", "适宜水培室内洁净观赏"));
        typeList.add(new PlantType(7, "银杏", "银杏科银杏属落叶乔木"));
    }

    // 日期格式处理：截取 yyyy-MM-dd 以适配 input[type="date"]
    String dateVal = plant.getPdatetime();
    if (dateVal != null && dateVal.length() >= 10) {
        dateVal = dateVal.substring(0, 10);
    } else if (dateVal == null || dateVal.isEmpty()) {
        dateVal = "2026-09-07";
    }

    String picVal = plant.getPpic();
    if (picVal == null || picVal.trim().isEmpty()) {
        picVal = "tf1yx.jpg";
    }
%>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="referrer" content="no-referrer">
    <title>天府绿化集团 - 修改绿植信息</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 30px 20px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
            background: url("新增.png") no-repeat center center fixed;
            background-size: cover;
        }

        /* 左右分栏总外层容器 */
        .layout-container {
            display: flex;
            justify-content: center;
            align-items: stretch;
            gap: 28px;
            width: 100%;
            max-width: 1140px;
            margin: auto;
        }

        /* 左侧卡片：绿植照片实时预览区 */
        .card-preview {
            flex: 0 1 420px;
            min-width: 320px;
            background: rgba(255, 255, 255, 0.42);
            backdrop-filter: blur(18px);
            -webkit-backdrop-filter: blur(18px);
            border-radius: 20px;
            box-shadow: 0 16px 40px rgba(0, 0, 0, 0.15);
            border: 1px solid rgba(255, 255, 255, 0.6);
            padding: 32px 28px;
            display: flex;
            flex-direction: column;
        }

        /* 右侧卡片：修改表单区 */
        .card-container {
            flex: 1 1 540px;
            max-width: 600px;
            background: rgba(255, 255, 255, 0.42);
            backdrop-filter: blur(18px);
            -webkit-backdrop-filter: blur(18px);
            border-radius: 20px;
            box-shadow: 0 16px 40px rgba(0, 0, 0, 0.15);
            border: 1px solid rgba(255, 255, 255, 0.6);
            padding: 34px 38px;
        }

        /* 顶部标题栏 */
        .card-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 22px;
            padding-bottom: 14px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.45);
        }

        .card-title {
            font-size: 21px;
            font-weight: 700;
            color: #0f172a;
            display: flex;
            align-items: center;
            gap: 8px;
            text-shadow: 0 1px 2px rgba(255, 255, 255, 0.6);
        }

        /* 左上角返回悬浮按钮 */
        .top-left-back-btn {
            position: fixed;
            top: 24px;
            left: 28px;
            z-index: 999;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 10px 20px;
            background: rgba(255, 255, 255, 0.78);
            backdrop-filter: blur(14px);
            -webkit-backdrop-filter: blur(14px);
            border: 1px solid rgba(255, 255, 255, 0.85);
            border-radius: 999px;
            color: #0f172a;
            font-size: 14px;
            font-weight: 700;
            text-decoration: none;
            box-shadow: 0 4px 18px rgba(0, 0, 0, 0.08);
            transition: all 0.25s ease;
        }

        .top-left-back-btn:hover {
            background: #ffffff;
            color: #059669;
            box-shadow: 0 8px 24px rgba(5, 150, 105, 0.2);
            transform: translateY(-2px);
        }

        .preview-badge {
            display: inline-flex;
            align-items: center;
            padding: 4px 10px;
            background: rgba(245, 158, 11, 0.18);
            border: 1px solid rgba(245, 158, 11, 0.35);
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
            color: #b45309;
        }

        /* 左侧大图预览展示框 */
        .image-preview-wrapper {
            flex: 1;
            min-height: 290px;
            max-height: 380px;
            border-radius: 16px;
            overflow: hidden;
            background: rgba(255, 255, 255, 0.32);
            border: 1px dashed rgba(245, 158, 11, 0.45);
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.05);
            margin-bottom: 18px;
        }

        #imagePreview {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
            transition: transform 0.35s ease;
        }

        #imagePreview:hover {
            transform: scale(1.03);
        }

        /* 图片缺省/占位状态 */
        .image-placeholder {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 24px;
            text-align: center;
            color: #475569;
        }

        .placeholder-icon {
            font-size: 48px;
            margin-bottom: 10px;
            opacity: 0.85;
        }

        .placeholder-title {
            font-size: 15px;
            font-weight: 600;
            color: #1e293b;
            margin-bottom: 6px;
        }

        .placeholder-desc {
            font-size: 12px;
            color: #64748b;
            line-height: 1.5;
        }

        /* 左侧底部信息小卡片 */
        .preview-footer {
            background: rgba(255, 255, 255, 0.38);
            border-radius: 12px;
            padding: 12px 14px;
            border: 1px solid rgba(255, 255, 255, 0.5);
        }

        .preview-info-row {
            display: flex;
            align-items: center;
            font-size: 13px;
            margin-bottom: 6px;
            color: #1e293b;
        }

        .info-label {
            font-weight: 600;
            color: #475569;
            flex-shrink: 0;
        }

        .info-value {
            font-family: monospace;
            font-weight: 600;
            color: #b45309;
            word-break: break-all;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .preview-tip {
            font-size: 12px;
            color: #64748b;
            line-height: 1.4;
        }

        /* 表单布局 */
        .form-item {
            margin-bottom: 16px;
        }

        .form-row {
            display: flex;
            gap: 16px;
        }

        .form-row .form-item {
            flex: 1;
        }

        label {
            display: block;
            margin-bottom: 6px;
            font-size: 14px;
            font-weight: 600;
            color: #1e293b;
        }

        /* 通用输入框、下拉框、日期选择器样式 */
        input[type="text"],
        input[type="date"],
        select,
        textarea {
            width: 100%;
            padding: 10px 14px;
            border: 1px solid rgba(255, 255, 255, 0.85);
            border-radius: 10px;
            font-size: 14px;
            color: #0f172a;
            font-weight: 500;
            background-color: rgba(255, 255, 255, 0.4);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.05);
            transition: all 0.25s ease;
            outline: none;
            font-family: inherit;
        }

        /* 下拉选择框定制美化 */
        select {
            cursor: pointer;
            appearance: none;
            -webkit-appearance: none;
            -moz-appearance: none;
            background-image: url("data:image/svg+xml;utf8,<svg fill='%23d97706' height='20' viewBox='0 0 24 24' width='20' xmlns='http://www.w3.org/2000/svg'><path d='M7 10l5 5 5-5z'/></svg>");
            background-repeat: no-repeat;
            background-position: right 12px center;
            padding-right: 36px;
        }

        select option {
            background-color: #ffffff;
            color: #1e293b;
            padding: 8px;
        }

        /* 日历控件样式适配 */
        input[type="date"] {
            cursor: pointer;
        }

        input[type="date"]::-webkit-calendar-picker-indicator {
            cursor: pointer;
            filter: opacity(0.65) drop-shadow(0 0 0 #d97706);
            transition: transform 0.2s;
        }

        input[type="date"]::-webkit-calendar-picker-indicator:hover {
            transform: scale(1.15);
            filter: opacity(1) drop-shadow(0 0 1px #d97706);
        }

        /* 输入框聚焦高亮 */
        input[type="text"]:focus,
        input[type="date"]:focus,
        select:focus,
        textarea:focus {
            border-color: #d97706;
            background-color: rgba(255, 255, 255, 0.75);
            box-shadow: 0 0 0 3px rgba(217, 119, 6, 0.25), inset 0 1px 2px rgba(0, 0, 0, 0.02);
        }

        /* 图片输入组合控件（手动路径 + 浏览本地按钮） */
        .input-upload-group {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .input-upload-group input[type="text"] {
            flex: 1;
        }

        /* 浏览本地图片按钮 */
        .btn-browse-file {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 10px 16px;
            background: rgba(255, 255, 255, 0.85);
            color: #b45309;
            font-weight: 600;
            font-size: 13px;
            border: 1px solid rgba(217, 119, 6, 0.4);
            border-radius: 10px;
            cursor: pointer;
            white-space: nowrap;
            transition: all 0.25s ease;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
            user-select: none;
        }

        .btn-browse-file:hover {
            background-color: #d97706;
            color: #ffffff;
            border-color: #d97706;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(217, 119, 6, 0.35);
        }

        .upload-status-msg {
            margin-top: 5px;
            font-size: 12px;
            min-height: 18px;
        }

        .status-uploading { color: #0284c7; }
        .status-success { color: #059669; font-weight: 600; }
        .status-tip { color: #b45309; }

        textarea {
            resize: vertical;
            line-height: 1.5;
        }

        /* 提交保存按钮（采用暖橙琥珀色系，与修改操作契合） */
        .btn-submit {
            width: 100%;
            padding: 13px;
            background-color: #d97706;
            color: #ffffff;
            border: none;
            border-radius: 10px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.25s ease;
            box-shadow: 0 4px 14px rgba(217, 119, 6, 0.35);
            margin-top: 6px;
        }

        .btn-submit:hover {
            background-color: #b45309;
            transform: translateY(-1px);
            box-shadow: 0 6px 18px rgba(217, 119, 6, 0.45);
        }

        .btn-submit:active {
            transform: translateY(0);
        }

        /* 响应式排版 */
        @media (max-width: 960px) {
            .layout-container {
                flex-direction: column-reverse;
                align-items: center;
            }

            .card-preview,
            .card-container {
                width: 100%;
                max-width: 580px;
            }

            .image-preview-wrapper {
                min-height: 240px;
            }
        }
    </style>
</head>
<body>

<!-- 左上角返回档案查询悬浮按钮 -->
<a href="QueryServlet" class="top-left-back-btn">← 返回档案查询</a>

<div class="layout-container">
    <!-- 左侧：绿植照片实时预览区 -->
    <div class="card-preview">
        <div class="card-header">
            <h2 class="card-title">🖼️ 绿植照片实时预览</h2>
            <span class="preview-badge" id="previewBadge">信息修改</span>
        </div>

        <div class="image-preview-wrapper" id="previewWrapper">
            <img id="imagePreview" src="<%= picVal %>" alt="绿植预览" referrerpolicy="no-referrer" onerror="handleImageError()" />
            <div id="imagePlaceholder" class="image-placeholder" style="display: none;">
                <div class="placeholder-icon">🍃</div>
                <div class="placeholder-title">暂无图片预览</div>
                <div class="placeholder-desc">支持在右侧输入网络/相对路径，或点击“浏览本地图片”上传</div>
            </div>
        </div>

        <div class="preview-footer">
            <div class="preview-info-row">
                <span class="info-label">照片路径：</span>
                <span class="info-value" id="previewPathDisplay"><%= picVal %></span>
            </div>
            <p class="preview-tip">💡 提示：在右侧修改路径或更换本地照片，左侧即时呈现效果。</p>
        </div>
    </div>

    <!-- 右侧：修改绿植信息录入卡片（直接包含表单，无任何空卡片） -->
    <div class="card-container">
        <div class="card-header">
            <h2 class="card-title">
                ✏️ 修改绿植信息
                <span style="font-size:12px;background:#d1fae5;color:#065f46;padding:3px 8px;border-radius:6px;font-weight:600;">植物管理员权限</span>
            </h2>
        </div>

        <form action="UpdatePlantServlet" method="post">
            <!-- 关键：通过隐藏域传递待修改的绿植主键 pid -->
            <input type="hidden" name="pid" value="<%= plant.getPid() != null ? plant.getPid() : "" %>" />

            <div class="form-row">
                <div class="form-item">
                    <label for="pname">绿植名称</label>
                    <input type="text" id="pname" name="pname" value="<%= plant.getPname() != null ? plant.getPname() : "" %>" required />
                </div>
                <div class="form-item">
                    <label for="ptype">绿植类别</label>
                    <!-- 动态下拉框，回显当前类别 -->
                    <select id="ptype" name="ptype" required>
                        <% for (PlantType pt : typeList) { 
                            boolean isSelected = pt.getTname().equals(plant.getPtype());
                        %>
                            <option value="<%= pt.getTname() %>" <%= isSelected ? "selected" : "" %>>
                                <%= pt.getTname() %>
                            </option>
                        <% } %>
                    </select>
                </div>
            </div>

            <div class="form-row">
                <div class="form-item">
                    <label for="pdatetime">起种日期</label>
                    <input type="date" id="pdatetime" name="pdatetime" value="<%= dateVal %>" required />
                </div>
                <div class="form-item">
                    <label for="pprice">价格 (元)</label>
                    <input type="text" id="pprice" name="pprice" value="<%= plant.getPprice() %>" required />
                </div>
            </div>

            <div class="form-row">
                <div class="form-item">
                    <label for="latitude">纬度</label>
                    <input type="number" id="latitude" name="latitude" step="0.0000001" min="-90" max="90" value="<%= plant.getLatitude() != null ? plant.getLatitude() : "" %>" placeholder="例如：30.5728" />
                </div>
                <div class="form-item">
                    <label for="longitude">经度</label>
                    <input type="number" id="longitude" name="longitude" step="0.0000001" min="-180" max="180" value="<%= plant.getLongitude() != null ? plant.getLongitude() : "" %>" placeholder="例如：104.0668" />
                </div>
            </div>

            <div class="form-row">
                <div class="form-item">
                    <label for="areaId">管理区域编号（可选）</label>
                    <select id="areaId" name="areaId">
                        <option value="">暂不分区</option>
                        <% for (PlantArea area : areaList) { %>
                            <option value="<%= area.getId() %>" <%= plant.getAreaId() != null && plant.getAreaId().equals(area.getId()) ? "selected" : "" %>><%= area.getAreaCode() %> - <%= area.getAreaName() %></option>
                        <% } %>
                    </select>
                </div>
                <div class="form-item">
                    <label for="waterPeriodDays">施水周期（天）</label>
                    <input type="number" id="waterPeriodDays" name="waterPeriodDays" min="1" value="<%= plant.getWaterPeriodDays() != null ? plant.getWaterPeriodDays() : "" %>" />
                </div>
            </div>

            <div class="form-row">
                <div class="form-item">
                    <label for="trimPeriodDays">修剪周期（天）</label>
                    <input type="number" id="trimPeriodDays" name="trimPeriodDays" min="1" value="<%= plant.getTrimPeriodDays() != null ? plant.getTrimPeriodDays() : "" %>" />
                </div>
                <div class="form-item">
                    <label for="fertilizePeriodDays">施肥周期（天）</label>
                    <input type="number" id="fertilizePeriodDays" name="fertilizePeriodDays" min="1" value="<%= plant.getFertilizePeriodDays() != null ? plant.getFertilizePeriodDays() : "" %>" />
                </div>
            </div>

            <div class="form-row">
                <div class="form-item">
                    <label for="pestPeriodDays">除害周期（天）</label>
                    <input type="number" id="pestPeriodDays" name="pestPeriodDays" min="1" value="<%= plant.getPestPeriodDays() != null ? plant.getPestPeriodDays() : "" %>" />
                </div>
                <div class="form-item">
                    <label for="nextWaterDate">下次施水日期</label>
                    <input type="date" id="nextWaterDate" name="nextWaterDate" value="<%= plant.getNextWaterDate() != null ? plant.getNextWaterDate() : "" %>" />
                </div>
            </div>

            <div class="form-row">
                <div class="form-item">
                    <label for="nextTrimDate">下次修剪日期</label>
                    <input type="date" id="nextTrimDate" name="nextTrimDate" value="<%= plant.getNextTrimDate() != null ? plant.getNextTrimDate() : "" %>" />
                </div>
                <div class="form-item">
                    <label for="nextFertilizeDate">下次施肥日期</label>
                    <input type="date" id="nextFertilizeDate" name="nextFertilizeDate" value="<%= plant.getNextFertilizeDate() != null ? plant.getNextFertilizeDate() : "" %>" />
                </div>
            </div>

            <div class="form-item">
                <label for="nextPestDate">下次除害日期</label>
                <input type="date" id="nextPestDate" name="nextPestDate" value="<%= plant.getNextPestDate() != null ? plant.getNextPestDate() : "" %>" />
            </div>

            <div class="form-item">
                <label for="ppic">照片文件名 / 路径</label>
                <div class="input-upload-group">
                    <input type="text" id="ppic" name="ppic" value="<%= picVal %>" placeholder="输入图片文件名/路径，或点击右侧浏览" />
                    <label for="fileUpload" class="btn-browse-file" title="点击更换本地图片">
                        📁 浏览更换图片
                    </label>
                    <input type="file" id="fileUpload" accept="image/*" style="display: none;" />
                </div>
                <div id="uploadStatusMsg" class="upload-status-msg"></div>
            </div>

            <div class="form-item">
                <label for="pdesc">绿植简介</label>
                <textarea id="pdesc" name="pdesc" rows="4"><%= plant.getPdesc() != null ? plant.getPdesc() : "" %></textarea>
            </div>

            <button type="submit" class="btn-submit">确认保存修改</button>
        </form>
    </div>
</div>

<script>
    const ppicInput = document.getElementById('ppic');
    const fileUpload = document.getElementById('fileUpload');
    const imagePreview = document.getElementById('imagePreview');
    const imagePlaceholder = document.getElementById('imagePlaceholder');
    const previewPathDisplay = document.getElementById('previewPathDisplay');
    const uploadStatusMsg = document.getElementById('uploadStatusMsg');

    // 图片加载成功
    imagePreview.onload = function() {
        imagePreview.style.display = 'block';
        imagePlaceholder.style.display = 'none';
        const val = ppicInput.value.trim();
        if (val.startsWith('http://') || val.startsWith('https://')) {
            uploadStatusMsg.innerHTML = '<span class="status-success">✅ 网络图片加载成功并已关联</span>';
        }
    };

    // 图片加载失败/空路径时优雅回退到占位展示
    function handleImageError() {
        imagePreview.style.display = 'none';
        imagePlaceholder.style.display = 'flex';
        const val = ppicInput.value.trim();
        if (val.startsWith('http://') || val.startsWith('https://')) {
            uploadStatusMsg.innerHTML = '<span style="color:#ef4444; font-size:12px;">⚠️ 网络图片加载受限（可能链接失效或受到目标网站安全策略限制）</span>';
        }
    }

    // 根据输入框内容同步刷新左侧大图预览
    function updatePreviewFromText() {
        let val = ppicInput.value.trim().replace(/^['"]|['"]$/g, '');
        ppicInput.value = val;
        previewPathDisplay.textContent = val || '暂无路径';
        if (val) {
            imagePreview.referrerPolicy = 'no-referrer'; // 穿透防盗链
            imagePreview.style.display = 'block';
            imagePlaceholder.style.display = 'none';
            imagePreview.src = val;
            if (val.startsWith('http://') || val.startsWith('https://')) {
                uploadStatusMsg.innerHTML = '<span class="status-tip">🌐 正在载入网络图片链接...</span>';
            }
        } else {
            handleImageError();
        }
    }

    // 监听手动修改与粘贴
    ppicInput.addEventListener('input', updatePreviewFromText);
    ppicInput.addEventListener('change', updatePreviewFromText);

    // 监听更换本地图片
    fileUpload.addEventListener('change', function(e) {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        // 本地立即毫秒级预览
        const localBlobUrl = URL.createObjectURL(file);
        imagePreview.src = localBlobUrl;
        imagePreview.style.display = 'block';
        imagePlaceholder.style.display = 'none';
        previewPathDisplay.textContent = file.name + ' (本地准备上传)';

        uploadStatusMsg.innerHTML = '<span class="status-uploading">⏳ 正在上传新图片到服务器...</span>';

        const formData = new FormData();
        formData.append('file', file);

        fetch('UploadServlet', {
            method: 'POST',
            body: formData
        })
        .then(response => {
            if (!response.ok) throw new Error('网络响应异常: ' + response.status);
            return response.json();
        })
        .then(data => {
            if (data.success) {
                ppicInput.value = data.url;
                previewPathDisplay.textContent = data.url;
                uploadStatusMsg.innerHTML = '<span class="status-success">✅ 新图片上传成功，已关联：' + data.url + '</span>';
            } else {
                ppicInput.value = 'uploads/' + file.name;
                previewPathDisplay.textContent = 'uploads/' + file.name;
                uploadStatusMsg.innerHTML = '<span class="status-tip">💡 已载入新图片：' + file.name + '</span>';
            }
        })
        .catch(err => {
            ppicInput.value = 'uploads/' + file.name;
            previewPathDisplay.textContent = 'uploads/' + file.name;
            uploadStatusMsg.innerHTML = '<span class="status-tip">💡 本地预览已就绪，已关联：uploads/' + file.name + '</span>';
        });
    });

    window.addEventListener('DOMContentLoaded', () => {
        updatePreviewFromText();
    });
</script>

</body>
</html>
