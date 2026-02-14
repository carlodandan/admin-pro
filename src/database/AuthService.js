const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { app } = require('electron');

class AuthService {
  constructor(supabase) {
    this.supabase = supabase;
    // Store database in user data directory
    const userDataPath = app.getPath('userData');
    this.dbPath = path.join(userDataPath, 'company-admin.sqlite');
    this.keyPath = path.join(userDataPath, 'encryption.key');

    // Initialize database
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    // Initialize or load encryption key
    this.secretKey = this.initializeEncryptionKey();

    // Create tables - Handled by DatabaseService now
    // this.initializeDatabase();


  }

  /**
   * Initialize or load encryption key from file
   */
  initializeEncryptionKey() {
    try {
      if (fs.existsSync(this.keyPath)) {
        // Load existing key
        const keyData = fs.readFileSync(this.keyPath, 'utf8');
        const parsedKey = JSON.parse(keyData);
        return parsedKey.key;
      } else {
        // Generate new key
        const newKey = crypto.randomBytes(32).toString('hex');
        const keyData = {
          key: newKey,
          created: new Date().toISOString(),
          algorithm: 'aes-256-gcm'
        };

        fs.writeFileSync(this.keyPath, JSON.stringify(keyData), { encoding: 'utf8' });

        return newKey;
      }
    } catch (error) {
      console.error('Error handling encryption key:', error);

      // Fallback to environment variable or app-specific derivation
      return this.getFallbackKey();
    }
  }

  /**
   * Fallback key generation based on machine-specific data
   */
  getFallbackKey() {
    // Use a combination of machine-specific data
    // This is not as secure but better than hardcoded
    const machineInfo = [
      app.getPath('userData'),
      process.platform,
      app.getName()
    ].join('|');

    return crypto.createHash('sha256')
      .update(machineInfo)
      .digest('hex')
      .slice(0, 64); // 32 bytes in hex
  }



  /**
   * Encrypt a password using AES-256-GCM with instance key
   */
  encryptPassword(password) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.getKey(this.secretKey), iv);

    let encrypted = cipher.update(password, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return {
      iv: iv.toString('hex'),
      encrypted: encrypted,
      authTag: authTag.toString('hex'),
      keyVersion: '1.0' // Track key version for future rotations
    };
  }

  /**
   * Decrypt a password using AES-256-GCM with instance key
   */
  decryptPassword(encryptedData) {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.getKey(this.secretKey),
      Buffer.from(encryptedData.iv, 'hex')
    );

    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));

    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Get encryption key from secret
   */
  getKey(secret) {
    return crypto.createHash('sha256').update(secret).digest();
  }

  /**
   * Hash password using bcryptjs
   */
  async hashPassword(password) {
    try {
      // Generate salt and hash with bcrypt (10 rounds)
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(password, salt);
      return hash;
    } catch (error) {
      console.error('Error hashing password:', error);
      throw error;
    }
  }

  /**
   * Verify password using bcryptjs
   */
  async verifyPassword(password, hash) {
    try {
      return await bcrypt.compare(password, hash);
    } catch (error) {
      console.error('Error verifying password:', error);
      return false;
    }
  }

  /**
   * Check if system is already registered
   */
  async isSystemRegistered() {
    try {
      // 1. Check Supabase First (via Secure RPC)
      if (this.supabase) {
        // We use an RPC function because anon key cannot list users
        // v2: Checks both public.registration_credentials AND auth.users link
        const { data, error } = await this.supabase.rpc('check_admin_exists_v2');

        if (!error && data === true) {

          return true;
        } else if (error) {
          // If RPC doesn't exist yet, we might get an error.
          // In that case, we fall back to local or assume false.
          console.warn('Supabase registration check failed (RPC error):', error.message);
        }
      }

      // 2. Fallback to Local

      const stmt = this.db.prepare(`
        SELECT COUNT(*) as count 
        FROM registration_credentials 
        WHERE is_registered = 1
      `);
      const result = stmt.get();
      return result.count > 0;
    } catch (error) {
      console.error('Error checking registration status:', error);
      return false;
    }
  }

  /**
   * Store initial registration information WITH Generated Super Admin Password
   */
  async storeRegistration(registrationData) {
    try {
      // Check if already registered
      if (await this.isSystemRegistered()) {
        throw new Error('System is already registered');
      }

      // Check if admin email already exists
      const checkStmt = this.db.prepare(`
      SELECT COUNT(*) as count 
      FROM registration_credentials 
      WHERE admin_email = ?
    `);
      const exists = checkStmt.get(registrationData.admin_email);

      if (exists.count > 0) {
        throw new Error('Admin email already exists');
      }

      // Create Supabase User
      await this.createSupabaseAdmin(registrationData.admin_email, registrationData.admin_password, {
        name: registrationData.admin_name,
        company_name: registrationData.company_name
      });

      // Hash both passwords using bcrypt
      const adminPasswordHash = await this.hashPassword(registrationData.admin_password);
      const superAdminPasswordHash = await this.hashPassword(registrationData.super_admin_password);

      // Generate a simple license key
      const licenseKey = this.generateLicenseKey();

      // Store everything in registration_credentials table
      const stmt = this.db.prepare(`
      INSERT INTO registration_credentials (
        -- Company Information
        company_name,
        company_email,
        company_address,
        company_contact,
        
        -- Admin Information
        admin_name,
        admin_email,
        admin_password_hash,
        
        -- Super Admin Password
        super_admin_password_hash,
        
        -- Registration Status
        is_registered,
        license_key,
        registration_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

      const now = new Date().toISOString();
      const result = stmt.run(
        // Company Information
        registrationData.company_name,
        registrationData.company_email,
        registrationData.company_address || null,
        registrationData.company_contact || null,

        // Admin Information
        registrationData.admin_name,
        registrationData.admin_email,
        adminPasswordHash,

        // Super Admin Password
        superAdminPasswordHash,

        // Registration Status
        1, // Mark as registered
        licenseKey,
        // Registration Date
        now
      );



      return {
        success: true,
        registrationId: result.lastInsertRowid,
        licenseKey: licenseKey,
        adminEmail: registrationData.admin_email,
        superAdminPassword: registrationData.super_admin_password
      };

    } catch (error) {
      console.error('Error storing registration:', error);
      throw error;
    }
  }

  /**
   * Helper to create Supabase User via SignUp (Anon Key)
   */
  async createSupabaseAdmin(email, password, metadata = {}) {
    if (!this.supabase) return;
    try {
      // Use signUp instead of admin.createUser
      const { data, error } = await this.supabase.auth.signUp({
        email: email,
        password: password,
        options: {
          data: {
            role: 'admin',
            ...metadata
          }
        }
      });

      if (error) {
        // If user already exists, we might want to allow it to proceed 
        // (assuming they own the account and just need to set up local DB)
        // But strict registration flow usually implies "New System".
        // However, user said "Check if it exist, do not show setup".
        // So if we reached here, isSystemRegistered returned False.
        // IF signUp says "User already registered", then isSystemRegistered failed to detect it?
        // We throw so storeRegistration catches it.
        throw error;
      }


      return data.user?.id;
    } catch (error) {
      console.error('Supabase Admin Creation Failed:', error);
      throw error; // Re-throw to handle in storeRegistration
    }
  }

  /**
   * Verify Super Admin Password for password reset
   */
  async verifySuperAdminPassword(email, superAdminPassword) {
    try {
      // Find the registration credentials
      const stmt = this.db.prepare(`
        SELECT super_admin_password_hash
        FROM registration_credentials
        WHERE admin_email = ?
      `);

      const result = stmt.get(email);

      if (!result) {
        return { success: false, error: 'No registration found for this email' };
      }

      // Verify using bcrypt
      const isValid = await this.verifyPassword(superAdminPassword, result.super_admin_password_hash);

      if (isValid) {
        return {
          success: true,
          message: 'Super Admin Password verified successfully'
        };
      }

      return {
        success: false,
        error: 'Super Admin Password is incorrect'
      };
    } catch (error) {
      console.error('Error verifying Super Admin Password:', error);
      return { success: false, error: 'Verification failed' };
    }
  }

  /**
   * Reset admin password using Super Admin Password
   */
  async resetAdminPassword(email, superAdminPassword, newPassword) {
    try {
      // First verify Super Admin Password
      const verification = await this.verifySuperAdminPassword(email, superAdminPassword);
      if (!verification.success) {
        return verification;
      }

      // Hash the new password
      const newPasswordHash = await this.hashPassword(newPassword);

      // Update ONLY registration_credentials table
      const updateStmt = this.db.prepare(`
      UPDATE registration_credentials 
      SET 
        admin_password_hash = ?, 
        last_reset_date = ?, 
        last_updated = ?,
        reset_count = reset_count + 1
      WHERE admin_email = ?
    `);

      updateStmt.run(
        newPasswordHash,
        new Date().toISOString(),
        new Date().toISOString(),
        email
      );

      return {
        success: true,
        message: 'Password reset successfully'
      };

    } catch (error) {
      console.error('Error resetting password:', error);
      return { success: false, error: 'Password reset failed' };
    }
  }
  /**
   * Generate a simple license key
   */
  generateLicenseKey() {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString('hex');
    return `LIC-${timestamp}-${random}`.toUpperCase();
  }

  /**
   * Get registration information
   */
  getRegistrationInfo() {
    try {
      const stmt = this.db.prepare(`
      SELECT 
        id,
        -- Company Information
        company_name,
        company_email,
        company_address,
        company_contact,
        
        -- Admin Information
        admin_name,
        admin_email,
        
        -- Registration Status
        license_key,
        is_registered,
        registration_date,
        last_updated
      FROM registration_credentials 
      WHERE is_registered = 1
      ORDER BY registration_date DESC
      LIMIT 1
    `);

      return stmt.get() || null;
    } catch (error) {
      console.error('Error getting registration info:', error);
      return null;
    }
  }

  /**
 * Verify admin login credentials
 */
  async verifyAdminLogin(email, password) {
    try {
      // 1. Try Supabase Auth First
      if (this.supabase) {
        const { data, error } = await this.supabase.auth.signInWithPassword({
          email,
          password
        });

        if (!error && data.user) {
          // Sync/Update local hash if successful (so offline limit still works with latest password)
          try {
            const newHash = await this.hashPassword(password);

            // Fetch latest profile from Supabase to ensure we have company/admin name
            const { data: profile, error: profileError } = await this.supabase
              .from('registration_credentials')
              .select('*')
              .eq('admin_email', email)
              .single();

            if (profile) {
              // Upsert into local DB
              const upsertStmt = this.db.prepare(`
                    INSERT INTO registration_credentials (
                        company_name, company_email, company_address, company_contact,
                        admin_name, admin_email, admin_password_hash, super_admin_password_hash,
                        avatar, bio, theme_preference, language,
                        is_registered, license_key, registration_date, last_updated, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(admin_email) DO UPDATE SET
                        company_name = excluded.company_name,
                        admin_name = excluded.admin_name,
                        admin_password_hash = excluded.admin_password_hash,
                        avatar = excluded.avatar,
                        last_updated = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP
                `);

              upsertStmt.run(
                profile.company_name, profile.company_email, profile.company_address, profile.company_contact,
                profile.admin_name, profile.admin_email, newHash, 'OFFLINE_PLACEHOLDER', // Placeholder for Super Admin Hash
                profile.avatar, profile.bio, profile.theme_preference, profile.language,
                1, profile.license_key, profile.registration_date, new Date().toISOString(), new Date().toISOString()
              );

            } else {
              // Fallback: If profile fetch failed (e.g. RLS or empty table), try to use Auth Metadata to insert minimal record
              const meta = data.user.user_metadata || {};
              const fallbackName = meta.name || 'Admin';
              const fallbackCompany = meta.company_name || 'Company';

              const upsertStmt = this.db.prepare(`
                    INSERT INTO registration_credentials (
                        company_name, company_email, company_address, company_contact,
                        admin_name, admin_email, admin_password_hash, super_admin_password_hash,
                        avatar, bio, theme_preference, language,
                        is_registered, license_key, registration_date, last_updated, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(admin_email) DO UPDATE SET
                        admin_password_hash = excluded.admin_password_hash,
                        last_updated = CURRENT_TIMESTAMP
                `);

              upsertStmt.run(
                fallbackCompany, email, null, null,
                fallbackName, email, newHash, 'OFFLINE_PLACEHOLDER', // Placeholder for Super Admin Hash
                null, null, 'light', 'en',
                1, `OFFLINE-${Date.now()}`, new Date().toISOString(), new Date().toISOString(), new Date().toISOString()
              );
              console.warn('Could not fetch Supabase profile, inserted local fallback record from Auth Metadata.');
            }

          } catch (syncErr) {
            console.warn('Failed to sync local password hash:', syncErr);
          }

          // Get extra details from local DB (now guaranteed to exist if sync worked)
          const stmt = this.db.prepare(`
                SELECT admin_name, company_name
                FROM registration_credentials 
                WHERE admin_email = ? AND is_registered = 1
                `);
          const registration = stmt.get(email);

          return {
            success: true,
            user: {
              email: email,
              name: registration ? registration.admin_name : (data.user.user_metadata?.name || 'Admin'),
              role: 'admin',
              company: registration ? registration.company_name : 'Company',
              supabase_id: data.user.id
            }
          };
        } else {
          console.warn('Supabase Login Failed:', error.message);
          // If error is invalid login, we should probably stop?
          // Or if error is network, fallback to local?
          // Supabase returns 400 for invalid credentials.
          if (error.stats === 400 || error.message.includes('Invalid login credentials')) {
            return { success: false, error: 'Invalid email or password' };
          }
        }
      }

      // 2. Fallback to Local SQLite

      const stmt = this.db.prepare(`
      SELECT 
        admin_password_hash,
        admin_name,
        company_name
      FROM registration_credentials 
      WHERE admin_email = ? AND is_registered = 1
    `);

      const registration = stmt.get(email);

      if (!registration) {
        return {
          success: false,
          error: 'Invalid email or password'
        };
      }

      // Verify password
      const isValid = await this.verifyPassword(
        password,
        registration.admin_password_hash
      );

      if (!isValid) {
        return {
          success: false,
          error: 'Invalid email or password'
        };
      }

      return {
        success: true,
        user: {
          email: email,
          name: registration.admin_name,
          role: 'admin',
          company: registration.company_name
        }
      };

    } catch (error) {
      console.error('Error verifying login:', error);
      return {
        success: false,
        error: 'Login verification failed'
      };
    }
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close();

    }
  }

  /**
   * Backup database
   * @returns {Object} Backup result
   */
  backupDatabase() {
    try {
      const backupPath = this.dbPath.replace('.sqlite', `-backup-${Date.now()}.sqlite`);

      fs.copyFileSync(this.dbPath, backupPath);

      return {
        success: true,
        backupPath: backupPath
      };
    } catch (error) {
      console.error('Error backing up database:', error);
      throw error;
    }
  }

  /**
   * Reset registration (for testing/debugging purposes)
   * WARNING: This will delete all registration data!
   */
  resetRegistration() {
    try {
      // Only delete from registration_credentials
      this.db.exec('DELETE FROM registration_credentials');
      this.db.exec('VACUUM'); // Clean up database file



      return {
        success: true,
        message: 'Registration reset complete'
      };
    } catch (error) {
      console.error('Error resetting registration:', error);
      throw error;
    }
  }

  async changeAdminPassword(email, currentPassword, newPassword) {
    try {
      // Get the current admin password hash
      const stmt = this.db.prepare(`
      SELECT admin_password_hash 
      FROM registration_credentials 
      WHERE admin_email = ? AND is_registered = 1
    `);

      const admin = stmt.get(email);

      if (!admin) {
        return { success: false, error: 'Admin not found' };
      }

      // Verify current password
      const isValid = await this.verifyPassword(currentPassword, admin.admin_password_hash);

      if (!isValid) {
        return { success: false, error: 'Current password is incorrect' };
      }

      // Hash the new password
      const newPasswordHash = await this.hashPassword(newPassword);

      // Update password
      const updateStmt = this.db.prepare(`
      UPDATE registration_credentials 
      SET admin_password_hash = ?, last_updated = ?
      WHERE admin_email = ?
    `);

      updateStmt.run(newPasswordHash, new Date().toISOString(), email);

      return {
        success: true,
        message: 'Password changed successfully'
      };
    } catch (error) {
      console.error('Error changing admin password:', error);
      return { success: false, error: 'Failed to change password' };
    }
  }
}

export default AuthService;