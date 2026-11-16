package security;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * 账号密码的加盐哈希（JDK 自带 PBKDF2WithHmacSHA256，不引第三方库）。
 * <pre>
 * 存储格式：pbkdf2_sha256$迭代次数$盐(Base64)$摘要(Base64)      例：pbkdf2_sha256$120000$q1w2…$Zx9…
 * </pre>
 * 兼容旧数据（登录成功后由 {@link #needsUpgrade} 判断并透明改写为新格式）：
 * <ul>
 *   <li>64 位十六进制：旧版 DBTools / SQL 脚本写入的无盐 SHA-256（SHA2('xxx', 256)）；</li>
 *   <li>其他不带前缀的值：按明文比较（历史上手工插入的明文行）。</li>
 * </ul>
 * 所有比较都用 {@link MessageDigest#isEqual} 常量时间比较。
 */
public final class PasswordHasher {
    private PasswordHasher() {
    }

    public static final String PREFIX = "pbkdf2_sha256";
    public static final int ITERATIONS = 120_000;
    private static final int SALT_BYTES = 16;
    private static final int KEY_BITS = 256;
    private static final Pattern LEGACY_SHA256 = Pattern.compile("^[0-9a-fA-F]{64}$");
    private static final SecureRandom RANDOM = new SecureRandom();

    /** 新密码的长度要求（账号管理里新建 / 重置密码时校验；登录时不校验，以免挡住旧的短密码）。 */
    public static final int MIN_LENGTH = 8, MAX_LENGTH = 64;

    /** 新密码不合规时返回提示语，合规返回 null。 */
    public static String policyProblem(String plain) {
        if (plain == null || plain.isEmpty()) return "请填写密码";
        if (plain.length() < MIN_LENGTH) return "密码至少 " + MIN_LENGTH + " 位";
        if (plain.length() > MAX_LENGTH) return "密码最多 " + MAX_LENGTH + " 位";
        if (!plain.equals(plain.trim())) return "密码首尾不能有空格";
        boolean letter = false, digit = false;
        for (char ch : plain.toCharArray()) {
            if (Character.isLetter(ch)) letter = true;
            if (Character.isDigit(ch)) digit = true;
        }
        if (!letter || !digit) return "密码需同时包含字母和数字";
        return null;
    }

    public static String hash(String plain) {
        byte[] salt = new byte[SALT_BYTES];
        RANDOM.nextBytes(salt);
        return encode(ITERATIONS, salt, pbkdf2(plain, salt, ITERATIONS));
    }

    /** 校验密码；stored 为空或格式损坏时返回 false。 */
    public static boolean verify(String plain, String stored) {
        if (plain == null || stored == null || stored.isEmpty()) return false;
        if (stored.startsWith(PREFIX + "$")) {
            String[] p = stored.split("\\$");
            if (p.length != 4) return false;
            try {
                int it = Integer.parseInt(p[1]);
                if (it < 1 || it > 10_000_000) return false;
                byte[] salt = Base64.getDecoder().decode(p[2]);
                byte[] expected = Base64.getDecoder().decode(p[3]);
                return MessageDigest.isEqual(expected, pbkdf2(plain, salt, it, expected.length * 8));
            } catch (IllegalArgumentException e) {
                return false;
            }
        }
        if (LEGACY_SHA256.matcher(stored).matches()) {
            byte[] a = SecurityUtils.sha256(plain).getBytes(StandardCharsets.US_ASCII);
            byte[] b = stored.toLowerCase(Locale.ROOT).getBytes(StandardCharsets.US_ASCII);
            return MessageDigest.isEqual(a, b);
        }
        // 历史明文行
        return MessageDigest.isEqual(plain.getBytes(StandardCharsets.UTF_8), stored.getBytes(StandardCharsets.UTF_8));
    }

    /** 旧格式（无盐 SHA-256 / 明文）或迭代次数低于当前值：登录成功后应改写为新哈希。 */
    public static boolean needsUpgrade(String stored) {
        if (stored == null || !stored.startsWith(PREFIX + "$")) return true;
        String[] p = stored.split("\\$");
        try {
            return p.length != 4 || Integer.parseInt(p[1]) < ITERATIONS;
        } catch (NumberFormatException e) {
            return true;
        }
    }

    private static String encode(int iterations, byte[] salt, byte[] key) {
        Base64.Encoder b64 = Base64.getEncoder().withoutPadding();
        return PREFIX + "$" + iterations + "$" + b64.encodeToString(salt) + "$" + b64.encodeToString(key);
    }

    private static byte[] pbkdf2(String plain, byte[] salt, int iterations) {
        return pbkdf2(plain, salt, iterations, KEY_BITS);
    }

    private static byte[] pbkdf2(String plain, byte[] salt, int iterations, int bits) {
        if (bits <= 0 || bits > 1024) throw new IllegalArgumentException("摘要长度不正确");
        PBEKeySpec spec = new PBEKeySpec(plain.toCharArray(), salt, iterations, bits);
        try {
            return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("当前 JDK 不支持 PBKDF2WithHmacSHA256", e);
        } finally {
            spec.clearPassword();
        }
    }
}
