import org.junit.jupiter.api.Test;
import security.PasswordHasher;
import security.SecurityUtils;

import static org.junit.jupiter.api.Assertions.*;

/** 账号密码的 PBKDF2 加盐哈希，以及旧数据（无盐 SHA-256 / 明文）的兼容与升级判断。 */
class PasswordHasherTest {
    @Test
    void hashIsSaltedAndVerifies() {
        String a = PasswordHasher.hash("Green2026");
        String b = PasswordHasher.hash("Green2026");
        assertTrue(a.startsWith("pbkdf2_sha256$" + PasswordHasher.ITERATIONS + "$"), a);
        assertNotEquals(a, b, "同一密码每次加盐结果不同");
        assertTrue(a.length() <= 255, "能放进 VARCHAR(255)");
        assertTrue(PasswordHasher.verify("Green2026", a));
        assertTrue(PasswordHasher.verify("Green2026", b));
        assertFalse(PasswordHasher.verify("green2026", a));
        assertFalse(PasswordHasher.verify("", a));
        assertFalse(PasswordHasher.verify(null, a));
        assertFalse(PasswordHasher.needsUpgrade(a));
    }

    @Test
    void legacySha256StillWorksButNeedsUpgrade() {
        String legacy = SecurityUtils.sha256("123456");          // 旧版 DBTools / SQL 脚本 SHA2('123456', 256)
        assertTrue(PasswordHasher.verify("123456", legacy));
        assertTrue(PasswordHasher.verify("123456", legacy.toUpperCase()));
        assertFalse(PasswordHasher.verify("1234567", legacy));
        assertTrue(PasswordHasher.needsUpgrade(legacy));
    }

    @Test
    void noUniversalPassword() {
        // 旧版 authenticateAdmin 对任何账号都接受 123456 / 演示默认密码；现在只认账号自己保存的密码
        String stored = PasswordHasher.hash("MyOwnPass9");
        for (String backdoor : new String[]{"123456", "System@123", "Plant@123", "Maintain@123"}) {
            assertFalse(PasswordHasher.verify(backdoor, stored), backdoor);
            assertFalse(PasswordHasher.verify(backdoor, SecurityUtils.sha256("MyOwnPass9")), backdoor);
        }
    }

    @Test
    void legacyPlaintextRowsNeedUpgrade() {
        assertTrue(PasswordHasher.verify("plain-old", "plain-old"));
        assertFalse(PasswordHasher.verify("plain-ol", "plain-old"));
        assertTrue(PasswordHasher.needsUpgrade("plain-old"));
    }

    @Test
    void corruptedOrLowIterationHashes() {
        assertFalse(PasswordHasher.verify("x", "pbkdf2_sha256$abc$$"));
        assertFalse(PasswordHasher.verify("x", "pbkdf2_sha256$1000$%%%$%%%"));
        assertFalse(PasswordHasher.verify("x", null));
        assertTrue(PasswordHasher.needsUpgrade("pbkdf2_sha256$1000$c2FsdA$aGFzaA"));
        assertTrue(PasswordHasher.needsUpgrade(null));
    }

    @Test
    void policy() {
        assertNotNull(PasswordHasher.policyProblem("123456"), "太短");
        assertNotNull(PasswordHasher.policyProblem("abcdefgh"), "缺数字");
        assertNotNull(PasswordHasher.policyProblem("12345678"), "缺字母");
        assertNotNull(PasswordHasher.policyProblem(" Green2026"), "首尾空格");
        assertNotNull(PasswordHasher.policyProblem(null));
        assertNull(PasswordHasher.policyProblem("Green2026"));
    }
}
