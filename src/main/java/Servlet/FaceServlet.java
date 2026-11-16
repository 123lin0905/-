package Servlet;

import DB.Jdbc;
import DB.JdbcAccountStore;
import DB.JdbcFaceStore;
import DB.MiniJson;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.example.demo1.AdminUser;
import security.FaceConfig;
import security.FaceMatcher;
import security.Roles;

import java.io.IOException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 人脸登录接口 /api/face/*（比对全部在服务端完成，特征向量从不下发到前端）：
 * <pre>
 * GET    /api/face/status                    公开：系统里是否已有人脸录入（只返回是否）
 * POST   /api/face/identify                  公开：{embedding:[…], real, live} → 识别成功则建立该账号的会话（养护员 → 工作台，管理员 → 数据大屏）
 * POST   /api/face/guest                     公开：以访客身份进入（只读）
 * GET    /api/face/profiles[?account_id=]    登录：本人的录入记录；管理员可看其管理范围内的账号
 * POST   /api/face/enroll                    登录：{account_id?, embeddings:[[…]×3–5], real, live, thumbnail?} 多帧取平均后追加保存
 * DELETE /api/face/profiles/{id}             仅管理员：删除一条（养护人员不能删，连自己的也不能）
 * GET    /api/face/accounts                  仅管理员：人脸信息管理账号列表（条数、录入时间、录入人、缩略图）
 * GET    /api/face/accounts/{id}/profiles    仅管理员：某账号的全部录入记录
 * DELETE /api/face/accounts/{id}/profiles    仅管理员：删除某账号的全部人脸
 * </pre>
 * 人脸长期保存：一经录入，只有管理员在“人脸信息管理”里手动删除 / 更换才会变化；退出登录、重新录入、达到条数上限、账号停用都不会自动删除或覆盖。
 * 管理范围（{@link Roles#canManageFaceOf}）：SYSTEM_ADMIN / SUPER_ADMIN / ADMIN 可管理所有人（含其他管理员）；
 * PLANT_ADMIN / MAINTENANCE_ADMIN 只能管理养护人员和自己；养护人员只能给自己录入、查看，不能删除。访客 403，未登录 401。
 */
@WebServlet(name = "FaceServlet", value = "/api/face/*")
public class FaceServlet extends HttpServlet {
    private static final Pattern PROFILE = Pattern.compile("^/profiles/(\\d{1,18})/?$");
    private static final Pattern ACCOUNT_PROFILES = Pattern.compile("^/accounts/(\\d{1,9})/profiles/?$");
    private static final Pattern THUMB = Pattern.compile("^data:image/jpeg;base64,[A-Za-z0-9+/=]+$");
    private static final long WINDOW_MS = 5 * 60_000L;

    private final JdbcFaceStore faces = new JdbcFaceStore();
    private final JdbcAccountStore accounts = new JdbcAccountStore();
    /** 识别尝试限流：IP → 最近 5 分钟的尝试时间。 */
    private final Map<String, Deque<Long>> attempts = new ConcurrentHashMap<>();

    @Override
    protected void service(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String path = req.getPathInfo() == null ? "/" : req.getPathInfo();
        String m = req.getMethod();
        try {
            if ("GET".equals(m) && "/status".equals(path)) { status(resp); return; }
            if ("POST".equals(m) && "/identify".equals(path)) { identify(req, resp); return; }
            if ("POST".equals(m) && "/guest".equals(path)) { guest(req, resp); return; }
            if ("GET".equals(m) && ("/profiles".equals(path) || "/profiles/".equals(path))) { profiles(req, resp); return; }
            if ("POST".equals(m) && "/enroll".equals(path)) { enroll(req, resp); return; }
            if ("GET".equals(m) && ("/accounts".equals(path) || "/accounts/".equals(path))) { accounts(req, resp); return; }
            Matcher pm = PROFILE.matcher(path);
            if ("DELETE".equals(m) && pm.matches()) { delete(req, resp, Long.parseLong(pm.group(1))); return; }
            Matcher am = ACCOUNT_PROFILES.matcher(path);
            if (am.matches() && "GET".equals(m)) { accountProfiles(req, resp, Integer.parseInt(am.group(1))); return; }
            if (am.matches() && "DELETE".equals(m)) { deleteAll(req, resp, Integer.parseInt(am.group(1))); return; }
            ApiSupport.error(resp, 404, "not_found", "没有这个接口：" + m + " /api/face" + path);
        } catch (Jdbc.DbUnavailableException e) {
            ApiSupport.dbDown(this, resp, e);
        } catch (IllegalArgumentException e) {
            ApiSupport.error(resp, 400, "bad_request", e.getMessage());
        }
    }

    private void status(HttpServletResponse resp) throws IOException, Jdbc.DbUnavailableException {
        int n = faces.countAll();
        ApiSupport.json(resp, 200, ApiSupport.obj("enrolled", n > 0, "db", true));
    }

    private boolean rateLimited(HttpServletRequest req) {
        long now = System.currentTimeMillis();
        Deque<Long> q = attempts.computeIfAbsent(req.getRemoteAddr(), k -> new ArrayDeque<>());
        synchronized (q) {
            while (!q.isEmpty() && now - q.peekFirst() > WINDOW_MS) q.pollFirst();
            if (q.size() >= FaceConfig.maxAttemptsPer5Min()) return true;
            q.addLast(now);
        }
        if (attempts.size() > 10_000) attempts.clear();   // 简单防内存膨胀
        return false;
    }

    private static double num(Map<String, Object> in, String k, double def) {
        Object v = in.get(k);
        return v instanceof Number ? ((Number) v).doubleValue() : def;
    }

    /** 基础活体 / 防翻拍检查（分数由前端 human 模型给出，见 FaceConfig 说明）。不通过返回提示语。 */
    private static String livenessProblem(Map<String, Object> in) {
        double real = num(in, "real", -1), live = num(in, "live", -1);
        if (real < 0 || live < 0) return "缺少活体检测结果，请刷新页面后重试";
        if (real < FaceConfig.minReal()) return "未通过防翻拍检测（请不要使用照片 / 屏幕），请正对摄像头重试";
        if (live < FaceConfig.minLive()) return "未通过活体检测，请正对摄像头、保持光线充足后重试";
        return null;
    }

    private void identify(HttpServletRequest req, HttpServletResponse resp) throws IOException, Jdbc.DbUnavailableException {
        if (rateLimited(req)) { ApiSupport.error(resp, 429, "too_many_attempts", "识别尝试过于频繁，请 5 分钟后再试，或使用账号密码登录"); return; }
        String body = ApiSupport.body(req, 256 * 1024);
        if (body == null) { ApiSupport.error(resp, 413, "too_large", "请求过大"); return; }
        Map<String, Object> in = MiniJson.parseObject(body);
        float[] probe = FaceMatcher.toVector(in.get("embedding") instanceof List ? (List<?>) in.get("embedding") : null);
        if (probe == null) { ApiSupport.error(resp, 400, "bad_request", "人脸特征格式不正确"); return; }
        String live = livenessProblem(in);
        if (live != null) { ApiSupport.error(resp, 422, "liveness_failed", live); return; }
        List<FaceMatcher.Profile> all = faces.allVectors();
        if (all.isEmpty()) { ApiSupport.json(resp, 409, ApiSupport.obj("error", "no_faces", "message", "系统里还没有任何人脸录入，请先进行人脸录入")); return; }
        FaceMatcher.Match match = FaceMatcher.identify(probe, all, FaceConfig.threshold(), FaceConfig.margin());
        AdminUser user = match.matched() ? accounts.findActive(match.accountId) : null;
        if (user == null || !Roles.canEnrollFace(user.getRoleCode())) {
            log("人脸识别未通过：best=" + String.format("%.3f", match.best) + " second=" + String.format("%.3f", match.second) + " ip=" + req.getRemoteAddr());
            ApiSupport.json(resp, 401, ApiSupport.obj("ok", false, "error", "not_recognized",
                    "message", "未能识别您的身份。可以重试，或以访客身份进入、使用账号密码登录"));
            return;
        }
        Roles.signIn(req, user, "face");
        log("人脸登录成功：" + user.getUsername() + "（" + user.getRoleCode() + "）similarity=" + String.format("%.3f", match.best));
        ApiSupport.json(resp, 200, ApiSupport.obj("ok", true, "user", ApiSupport.userJson(user, false),
                "similarity", Math.round(match.best * 1000) / 1000.0,
                "redirect", req.getContextPath() + Roles.homeFor(user)));
    }

    private void guest(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        Roles.enterAsVisitor(req);
        ApiSupport.json(resp, 200, ApiSupport.obj("ok", true, "user", ApiSupport.userJson(null, true),
                "redirect", req.getContextPath() + "/ecohome.jsp"));
    }

    private enum Op { VIEW, ENROLL, DELETE }

    /**
     * 解析目标账号并按操作校验权限（规则集中在 {@link Roles}）。账号已删除但人脸仍在时返回只含 id 的占位信息（role_code 为 null）。
     * 不允许返回 null，并已写好 403 / 404。
     */
    private Map<String, Object> targetAccount(HttpServletResponse resp, AdminUser me, Integer accountId, Op op)
            throws IOException, Jdbc.DbUnavailableException {
        int target = accountId == null ? me.getId() : accountId;
        Map<String, Object> acc = accounts.accountInfo(target);
        if (acc == null) {
            if (op == Op.ENROLL || faces.countByAccount(target) == 0) { ApiSupport.error(resp, 404, "not_found", "账号不存在"); return null; }
            acc = ApiSupport.obj("id", target, "username", null, "display_name", "（账号已删除）", "role_code", null, "deleted", true);
        }
        String role = (String) acc.get("role_code");
        boolean ok;
        switch (op) {
            case ENROLL: ok = Roles.canEnrollFaceFor(me.getRoleCode(), me.getId(), role, target); break;
            case DELETE: ok = Roles.canDeleteFaceOf(me.getRoleCode(), me.getId(), role, target); break;
            default: ok = Roles.canViewFacesOf(me.getRoleCode(), me.getId(), role, target);
        }
        if (ok) return acc;
        String msg;
        if (!Roles.canManageFaces(me.getRoleCode())) {
            msg = op == Op.DELETE ? "人脸录入后长期保存，只有管理员可以删除 / 更换；如需更换请联系管理员" : "只能为自己的账号录入 / 查看人脸";
        } else if (op == Op.ENROLL && !Roles.canEnrollFace(role)) {
            msg = "该账号角色不需要录入人脸";
        } else {
            msg = "当前管理员角色只能管理养护人员和自己的人脸；其他管理员的人脸请由系统管理员（SYSTEM_ADMIN / SUPER_ADMIN / ADMIN）管理";
        }
        ApiSupport.error(resp, 403, "forbidden", msg);
        return null;
    }

    private static Integer intParam(String s) {
        if (s == null || s.trim().isEmpty()) return null;
        try { return Integer.valueOf(s.trim()); } catch (NumberFormatException e) { throw new IllegalArgumentException("account_id 应为整数"); }
    }

    /** 记录列表 + 当前操作人对该账号的能力（前端据此显示 / 隐藏删除按钮；服务端仍会再校验）。 */
    private Map<String, Object> profilesBody(AdminUser me, Map<String, Object> acc) throws Jdbc.DbUnavailableException {
        int id = (Integer) acc.get("id");
        String role = (String) acc.get("role_code");
        Map<String, Object> a = new java.util.LinkedHashMap<>(acc);
        a.put("role_label", Roles.faceRoleLabel(role));
        return ApiSupport.obj("account", a, "items", faces.listByAccount(id),
                "max", FaceConfig.maxProfilesPerAccount(),
                "can_delete", Roles.canDeleteFaceOf(me.getRoleCode(), me.getId(), role, id),
                "can_enroll", Roles.canEnrollFaceFor(me.getRoleCode(), me.getId(), role, id));
    }

    private void profiles(HttpServletRequest req, HttpServletResponse resp) throws IOException, Jdbc.DbUnavailableException {
        AdminUser me = ApiSupport.require(req, resp, Roles.FACE_ROLES, "人脸管理");
        if (me == null) return;
        Map<String, Object> acc = targetAccount(resp, me, intParam(req.getParameter("account_id")), Op.VIEW);
        if (acc == null) return;
        ApiSupport.json(resp, 200, profilesBody(me, acc));
    }

    private void accountProfiles(HttpServletRequest req, HttpServletResponse resp, int accountId) throws IOException, Jdbc.DbUnavailableException {
        AdminUser me = ApiSupport.require(req, resp, Roles.ADMIN_ROLES, "人脸信息管理");
        if (me == null) return;
        Map<String, Object> acc = targetAccount(resp, me, accountId, Op.VIEW);
        if (acc == null) return;
        ApiSupport.json(resp, 200, profilesBody(me, acc));
    }

    /** 人脸信息管理：当前管理员可管理的全部账号（不含特征向量）。 */
    private void accounts(HttpServletRequest req, HttpServletResponse resp) throws IOException, Jdbc.DbUnavailableException {
        AdminUser me = ApiSupport.require(req, resp, Roles.ADMIN_ROLES, "人脸信息管理");
        if (me == null) return;
        List<Map<String, Object>> items = new ArrayList<>();
        int withFace = 0, total = 0;
        for (Map<String, Object> a : accounts.faceAccounts()) {
            int id = (Integer) a.get("id");
            String role = (String) a.get("role_code");
            if (!Roles.canManageFaceOf(me.getRoleCode(), me.getId(), role, id)) continue;
            a.put("role_label", Roles.faceRoleLabel(role));
            a.put("is_me", id == me.getId());
            a.put("can_delete", Roles.canDeleteFaceOf(me.getRoleCode(), me.getId(), role, id));
            a.put("can_enroll", Roles.canEnrollFaceFor(me.getRoleCode(), me.getId(), role, id));
            items.add(a);
            total += (Integer) a.get("face_count");
            if ((Integer) a.get("face_count") > 0) withFace++;
        }
        ApiSupport.json(resp, 200, ApiSupport.obj("items", items,
                "scope", Roles.canManageAllFaces(me.getRoleCode()) ? "all" : "maintainers",
                "max", FaceConfig.maxProfilesPerAccount(), "accounts_with_face", withFace, "profiles", total,
                "me", ApiSupport.userJson(me, false)));
    }

    /** 删除某账号的全部人脸（仅管理员手动操作）。 */
    private void deleteAll(HttpServletRequest req, HttpServletResponse resp, int accountId) throws IOException, Jdbc.DbUnavailableException {
        AdminUser me = ApiSupport.require(req, resp, Roles.ADMIN_ROLES, "人脸信息管理");
        if (me == null) return;
        Map<String, Object> acc = targetAccount(resp, me, accountId, Op.DELETE);
        if (acc == null) return;
        int n = faces.deleteByAccount(accountId);
        log("删除账号全部人脸：账号 " + acc.get("username") + "（#" + accountId + "）共 " + n + " 条，操作人 " + me.getUsername());
        Map<String, Object> body = profilesBody(me, acc);
        body.put("ok", true);
        body.put("deleted", n);
        ApiSupport.json(resp, 200, body);
    }

    @SuppressWarnings("unchecked")
    private void enroll(HttpServletRequest req, HttpServletResponse resp) throws IOException, Jdbc.DbUnavailableException {
        AdminUser me = ApiSupport.require(req, resp, Roles.FACE_ROLES, "人脸录入");
        if (me == null) return;
        String body = ApiSupport.body(req, 512 * 1024);
        if (body == null) { ApiSupport.error(resp, 413, "too_large", "请求过大"); return; }
        Map<String, Object> in = MiniJson.parseObject(body);
        Object aid = in.get("account_id");
        Integer accountId = aid instanceof Number ? Integer.valueOf(((Number) aid).intValue()) : null;
        Map<String, Object> acc = targetAccount(resp, me, accountId, Op.ENROLL);
        if (acc == null) return;
        int target = (Integer) acc.get("id");

        Object raw = in.get("embeddings");
        if (!(raw instanceof List) || ((List<?>) raw).size() < 3 || ((List<?>) raw).size() > 5) {
            ApiSupport.error(resp, 400, "bad_request", "需要 3–5 帧不同角度的人脸特征"); return;
        }
        List<float[]> frames = new ArrayList<>();
        for (Object o : (List<Object>) raw) {
            float[] v = FaceMatcher.toVector(o instanceof List ? (List<?>) o : null);
            if (v == null) { ApiSupport.error(resp, 400, "bad_request", "人脸特征格式不正确"); return; }
            frames.add(v);
        }
        float[] mean;
        try { mean = FaceMatcher.average(frames); } catch (IllegalArgumentException e) { ApiSupport.error(resp, 400, "bad_request", e.getMessage()); return; }
        if (FaceMatcher.minPairwise(frames) < FaceConfig.minFrameConsistency()) {
            ApiSupport.error(resp, 422, "inconsistent_frames", "采集到的几帧不像同一个人（画面里可能有别人），请单独正对摄像头重新录入"); return;
        }
        String live = livenessProblem(in);
        if (live != null) { ApiSupport.error(resp, 422, "liveness_failed", live); return; }
        Object th = in.get("thumbnail");
        String thumb = th instanceof String && !((String) th).isEmpty() ? (String) th : null;
        if (thumb != null && (thumb.length() > 40_000 || !THUMB.matcher(thumb).matches())) {
            ApiSupport.error(resp, 400, "bad_request", "缩略图格式不正确（需为 40KB 以内的 JPEG data URL）"); return;
        }
        // 达到条数上限时拒绝（不会自动淘汰旧记录）：只有管理员能删除旧记录后再录入
        if (faces.countByAccount(target) >= FaceConfig.maxProfilesPerAccount()) {
            ApiSupport.error(resp, 409, "too_many", "该账号已录入 " + FaceConfig.maxProfilesPerAccount() + " 条人脸，已达上限。"
                    + (Roles.canManageFaces(me.getRoleCode()) ? "如需更换，请先在“人脸信息管理”中删除旧记录再录入" : "人脸长期保存，如需更换请联系管理员删除旧记录")); return;
        }
        // 防止同一张脸录到两个账号：与其他账号（含已停用 / 已删除账号仍保留的人脸）的人脸过于相似时拒绝
        List<FaceMatcher.Profile> others = new ArrayList<>();
        for (FaceMatcher.Profile p : faces.allVectorsAnyAccount()) if (p.accountId != target) others.add(p);
        FaceMatcher.Match near = FaceMatcher.closest(mean, others);
        if (near.accountId > 0 && near.best >= FaceConfig.threshold()) {
            ApiSupport.error(resp, 409, "duplicate_face", "这张脸与系统里另一个账号已录入的人脸过于相似，不能重复录入到不同账号"
                    + "（如确需转到本账号，请管理员先在“人脸信息管理”中删除原账号的人脸）"); return;
        }
        long id = faces.insert(target, (String) acc.get("role_code"), mean, frames.size(), thumb, ApiSupport.displayName(me));
        log("人脸录入：账号 " + acc.get("username") + "，操作人 " + me.getUsername() + "，帧数 " + frames.size());
        Map<String, Object> out = profilesBody(me, acc);
        out.put("ok", true);
        out.put("id", id);
        out.put("frames", frames.size());
        ApiSupport.json(resp, 201, out);
    }

    /** 删除一条人脸：仅管理员（养护人员 403，连自己的也不能删；人脸长期保存，由管理员统一更换）。 */
    private void delete(HttpServletRequest req, HttpServletResponse resp, long id) throws IOException, Jdbc.DbUnavailableException {
        AdminUser me = ApiSupport.require(req, resp, Roles.FACE_ROLES, "人脸管理");
        if (me == null) return;
        if (!Roles.canManageFaces(me.getRoleCode())) {
            ApiSupport.error(resp, 403, "forbidden", "人脸录入后长期保存，只有管理员可以删除 / 更换；如需更换请联系管理员"); return;
        }
        Integer owner = faces.ownerOf(id);
        if (owner == null) { ApiSupport.error(resp, 404, "not_found", "人脸记录不存在"); return; }
        Map<String, Object> acc = targetAccount(resp, me, owner, Op.DELETE);
        if (acc == null) return;
        faces.delete(id);
        log("删除人脸：#" + id + "（账号 " + acc.get("username") + "），操作人 " + me.getUsername());
        Map<String, Object> body = profilesBody(me, acc);
        body.put("ok", true);
        ApiSupport.json(resp, 200, body);
    }
}
