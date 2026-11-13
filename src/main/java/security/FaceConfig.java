package security;

/**
 * 人脸识别阈值。默认值见下；部署时可用 JVM 系统属性覆盖（如 CATALINA_OPTS="-Dface.threshold=0.65"）。
 * <ul>
 *   <li>face.threshold  余弦相似度阈值，默认 0.60；</li>
 *   <li>face.margin     最佳账号需领先第二名账号的差值，默认 0.04（防两个账号都“有点像”时误判）；</li>
 *   <li>face.minReal    human antispoof 模型的 real 分数下限，默认 0.30；</li>
 *   <li>face.minLive    human liveness 模型的 live 分数下限，默认 0.50。</li>
 * </ul>
 * antispoof / liveness 只是基础防护：分数由浏览器端模型计算后上报，服务端只能检查数值，无法证明它没有被篡改；
 * 用 human 自带的真人照片实测 real 分数只有 0.40–0.80，所以 minReal 不能设太高，高清照片 / 屏幕翻拍仍可能通过。
 */
public final class FaceConfig {
    private FaceConfig() {
    }

    public static double threshold() { return get("face.threshold", 0.60); }

    public static double margin() { return get("face.margin", 0.04); }

    public static double minReal() { return get("face.minReal", 0.30); }

    public static double minLive() { return get("face.minLive", 0.50); }

    /** 录入时多帧两两相似度下限（低于它说明混进了别人），默认 0.50。 */
    public static double minFrameConsistency() { return get("face.minFrameConsistency", 0.50); }

    /** 每个账号最多保存的人脸条数。 */
    public static int maxProfilesPerAccount() { return (int) get("face.maxPerAccount", 5); }

    /** 同一 IP 5 分钟内最多识别尝试次数。 */
    public static int maxAttemptsPer5Min() { return (int) get("face.maxAttempts", 30); }

    private static double get(String key, double def) {
        String v = System.getProperty(key);
        if (v == null || v.trim().isEmpty()) return def;
        try {
            return Double.parseDouble(v.trim());
        } catch (NumberFormatException e) {
            return def;
        }
    }
}
