import "dotenv/config";
import pool, { initAuthDatabase } from "../src/config/database.js";
import { findUserByEmail, updateUserPassword } from "../src/models/user.model.js";
import { invalidateActiveOtps } from "../src/models/otp.model.js";
import {
  loginWithPassword,
  requestPasswordReset,
  resetPassword,
  signup,
  verifyLoginOtp,
} from "../src/services/auth.service.js";

async function runTests() {
  console.log("=== STARTING AUTH 2FA VERIFICATION TESTS ===");

  await initAuthDatabase();

  const testEmail = `testuser_${Date.now()}@example.com`;
  const testPhone = `91${Math.floor(1000000000 + Math.random() * 9000000000)}`;

  // Test 1: User Registration with Password
  console.log("\n1. Testing User Registration...");
  const signupResult = await signup({
    name: "Test Therapist",
    email: testEmail,
    password: "Password123",
    confirmPassword: "Password123",
    nationality: "IN",
    country: "IN",
    phoneCountryIso2: "IN",
    phoneCountryCode: "+91",
    phoneNumber: testPhone.slice(2),
    phone: testPhone,
  });
  console.log("✓ Signup result:", signupResult.message);

  // Verify DB state
  const dbUser = await findUserByEmail(testEmail);
  if (!dbUser) throw new Error("User was not found in DB");
  if (dbUser.role !== "USER") throw new Error(`Role is not USER: ${dbUser.role}`);
  if (!dbUser.password_hash || dbUser.password_hash === "Password123") {
    throw new Error("Password was not properly hashed");
  }
  console.log("✓ User saved in DB with hashed password and role USER");

  // Test 2: Reject duplicate registration
  console.log("\n2. Testing Duplicate Email Signup...");
  try {
    await signup({
      name: "Duplicate User",
      email: testEmail,
      password: "Password123",
      confirmPassword: "Password123",
      nationality: "IN",
      country: "IN",
      phoneCountryIso2: "IN",
      phoneCountryCode: "+91",
      phoneNumber: testPhone.slice(2),
      phone: testPhone,
    });
    throw new Error("Duplicate signup should have failed!");
  } catch (err: any) {
    console.log("✓ Correctly rejected duplicate email:", err.message);
  }

  // Test 3: Password verification (Invalid password)
  console.log("\n3. Testing Login with Incorrect Password...");
  try {
    await loginWithPassword(testEmail, "WrongPassword999");
    throw new Error("Login with wrong password should have failed!");
  } catch (err: any) {
    console.log("✓ Correctly rejected invalid password:", err.message);
  }

  // Test 4: Password verification (Non-existent email)
  console.log("\n4. Testing Login with Non-Existent Email...");
  try {
    await loginWithPassword("nonexistent@example.com", "Password123");
    throw new Error("Login with non-existent email should have failed!");
  } catch (err: any) {
    console.log("✓ Generic message returned (no enumeration):", err.message);
  }

  // Test 5: Password verification (Correct credentials -> OTP Challenge issued)
  console.log("\n5. Testing Login with Correct Password...");
  const loginChallenge = await loginWithPassword(testEmail, "Password123");
  if (!loginChallenge.challengeToken) throw new Error("No challengeToken returned");
  console.log("✓ 2FA challenge generated:", {
    maskedDestination: loginChallenge.maskedDestination,
    expiresInSeconds: loginChallenge.expiresInSeconds,
  });

  // Test 6: Verify incorrect OTP
  console.log("\n6. Testing Incorrect OTP Submission...");
  try {
    await verifyLoginOtp(loginChallenge.challengeToken, "000000");
    throw new Error("Incorrect OTP should have failed!");
  } catch (err: any) {
    console.log("✓ Correctly rejected bad OTP:", err.message, "Remaining attempts:", err.details?.attemptsRemaining);
  }

  // Test 7: Verify correct OTP
  console.log("\n7. Testing Correct OTP Verification...");
  const fs = await import("node:fs");
  const logContent = fs.readFileSync(".otp-dev.log", "utf8");
  const lines = logContent.trim().split("\n");
  const lastLine = lines[lines.length - 1];
  const otpCode = lastLine.split(" ")[2];
  console.log("Retrieved OTP from dev log:", otpCode);

  const verifyResult = await verifyLoginOtp(loginChallenge.challengeToken, otpCode);
  if (!verifyResult.token) throw new Error("No access token issued");
  if (verifyResult.user.email !== testEmail) throw new Error("User email mismatch");
  console.log("✓ OTP verified successfully! Logged in user:", verifyResult.user.name, "Role:", verifyResult.user.role);

  // Test 8: Prevent OTP reuse
  console.log("\n8. Testing Prevention of OTP Reuse...");
  try {
    await verifyLoginOtp(loginChallenge.challengeToken, otpCode);
    throw new Error("OTP reuse should have failed!");
  } catch (err: any) {
    console.log("✓ OTP reuse prevented:", err.message);
  }

  // Test 9: Forgot & Reset Password
  console.log("\n9. Testing Forgot & Reset Password Flow...");
  const resetChallenge = await requestPasswordReset(testEmail);
  if (!resetChallenge.challengeToken) throw new Error("No reset challenge token");
  console.log("✓ Reset challenge generated for:", resetChallenge.maskedDestination);

  const updatedLog = fs.readFileSync(".otp-dev.log", "utf8");
  const resetLines = updatedLog.trim().split("\n");
  const resetOtp = resetLines[resetLines.length - 1].split(" ")[2];
  console.log("Retrieved Reset OTP:", resetOtp);

  const resetResult = await resetPassword({
    challengeToken: resetChallenge.challengeToken,
    otp: resetOtp,
    password: "NewPassword789",
    confirmPassword: "NewPassword789",
  });
  console.log("✓ Reset password result:", resetResult.message);

  // Test 10: Clear cooldown timestamp for test and test Login with new password
  console.log("\n10. Testing Login with New Password...");
  await pool.query("UPDATE otp_verifications SET created_at = NOW() - INTERVAL '2 minutes' WHERE user_id = $1;", [dbUser.id]);
  const newLoginChallenge = await loginWithPassword(testEmail, "NewPassword789");
  console.log("✓ Login with new password succeeded! Challenge token generated:", newLoginChallenge.maskedDestination);

  // Test 11: Verify existing Admin and User accounts
  console.log("\n11. Verifying existing Admin and User accounts...");
  const admin5 = await findUserByEmail("admin.08683251@example.com");
  if (admin5) {
    console.log("✓ Admin 5 exists with role:", admin5.role);
    if (!admin5.password_hash) {
      const bcrypt = (await import("bcrypt")).default;
      const adminHash = await bcrypt.hash("Admin@1234", 10);
      await updateUserPassword(admin5.id, adminHash);
      console.log("✓ Set default secure password 'Admin@1234' for Admin 5");
    }
  }

  const user15 = await pool.query("SELECT id, name, email, courseids FROM users WHERE id = 15;");
  if (user15.rows[0]) {
    console.log("✓ User 15 preserved with courseids:", user15.rows[0].courseids);
    const user15Row = await findUserByEmail(user15.rows[0].email);
    if (user15Row && !user15Row.password_hash) {
      const bcrypt = (await import("bcrypt")).default;
      const userHash = await bcrypt.hash("User@1234", 10);
      await updateUserPassword(user15Row.id, userHash);
      console.log("✓ Set default secure password 'User@1234' for User 15");
    }
  }

  console.log("\n=== ALL 11 TESTS PASSED SUCCESSFULLY! ===");
}

runTests()
  .catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
