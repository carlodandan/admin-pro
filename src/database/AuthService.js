const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { app } = require('electron');

class AuthService {
  constructor() {
    // Store database in user data directory
    const userDataPath = app.getPath('userData');
    this.dbPath = path.join(userDataPath, 'auth-registration.sqlite');
    this.keyPath = path.join(userDataPath, 'encryption.key');
    
    // Initialize database
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    
    // Initialize or load encryption key
    this.secretKey = this.initializeEncryptionKey();
    
    // Create tables
    this.initializeDatabase();
    
    console.log(`AuthService initialized: Database at ${this.dbPath}`);
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
        console.log('New encryption key generated and saved');
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
   * Initialize database schema with Super Admin Password table
   */
  initializeDatabase() {
    // Registration information table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS registrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_name TEXT NOT NULL,
        company_address TEXT,
        company_phone TEXT,
        company_email TEXT NOT NULL,
        admin_name TEXT NOT NULL,
        admin_email TEXT NOT NULL UNIQUE,
        admin_password_hash TEXT NOT NULL,
        license_key TEXT UNIQUE,
        is_registered INTEGER DEFAULT 0,
        registered_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Super Admin Password table - UPDATED SCHEMA
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS registration_credentials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_name TEXT NOT NULL,
        company_email TEXT NOT NULL,
        admin_email TEXT NOT NULL UNIQUE,
        admin_password_hash TEXT NOT NULL,
        super_admin_password_hash TEXT NOT NULL,
        registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_reset_date TIMESTAMP,
        reset_count INTEGER DEFAULT 0,
        FOREIGN KEY (admin_email) REFERENCES registrations(admin_email) ON DELETE CASCADE
      )
    `);

    // Users table (for future multi-user support)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        registration_id INTEGER,
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        full_name TEXT,
        role TEXT DEFAULT 'user',
        is_active INTEGER DEFAULT 1,
        last_login DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (registration_id) REFERENCES registrations(id) ON DELETE CASCADE
      )
    `);

    // Create indexes for better performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_registrations_admin_email ON registrations(admin_email);
      CREATE INDEX IF NOT EXISTS idx_registrations_is_registered ON registrations(is_registered);
      CREATE INDEX IF NOT EXISTS idx_credentials_admin_email ON registration_credentials(admin_email);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    `);

    console.log('Database tables initialized');
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
  isSystemRegistered() {
    try {
      const stmt = this.db.prepare(`
        SELECT COUNT(*) as count 
        FROM registrations 
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
      if (this.isSystemRegistered()) {
        throw new Error('System is already registered');
      }

      // Check if admin email already exists
      const checkStmt = this.db.prepare(`
        SELECT COUNT(*) as count 
        FROM registrations 
        WHERE admin_email = ?
      `);
      const exists = checkStmt.get(registrationData.admin_email);
      
      if (exists.count > 0) {
        throw new Error('Admin email already exists');
      }

      // Hash the admin password using bcrypt
      const adminPasswordHash = await this.hashPassword(registrationData.admin_password);

      // Generate a simple license key
      const licenseKey = this.generateLicenseKey();

      // Generate Super Admin Password
      const superAdminPassword = registrationData.super_admin_password;
      
      console.log('Generated Super Admin Password:', superAdminPassword);

      // Hash Super Admin Password with bcrypt
      const superAdminPasswordHash = await this.hashPassword(superAdminPassword);

      // Start transaction
      this.db.exec('BEGIN TRANSACTION');
      
      try {
        // Store in registrations table
        const stmt = this.db.prepare(`
          INSERT INTO registrations (
            company_name,
            company_address,
            company_phone,
            company_email,
            admin_name,
            admin_email,
            admin_password_hash,
            license_key,
            is_registered,
            registered_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const now = new Date().toISOString();
        const result = stmt.run(
          registrationData.company_name,
          registrationData.company_address || null,
          registrationData.company_phone || null,
          registrationData.company_email,
          registrationData.admin_name,
          registrationData.admin_email,
          adminPasswordHash,
          licenseKey,
          1, // Mark as registered
          now
        );

        // Store in registration_credentials table
        const credStmt = this.db.prepare(`
          INSERT INTO registration_credentials (
            company_name,
            company_email,
            admin_email,
            admin_password_hash,
            super_admin_password_hash
          ) VALUES (?, ?, ?, ?, ?)
        `);

        credStmt.run(
          registrationData.company_name,
          registrationData.company_email,
          registrationData.admin_email,
          adminPasswordHash,
          superAdminPasswordHash
        );

        // Create the admin user account
        await this.createAdminUser(
          result.lastInsertRowid,
          registrationData.admin_email,
          registrationData.admin_password,
          registrationData.admin_name
        );

        // Commit transaction
        this.db.exec('COMMIT');

        console.log(`Registration stored successfully. ID: ${result.lastInsertRowid}`);
        
        return {
          success: true,
          registrationId: result.lastInsertRowid,
          licenseKey: licenseKey,
          adminEmail: registrationData.admin_email,
          superAdminPassword: superAdminPassword
        };

      } catch (error) {
        // Rollback on error
        this.db.exec('ROLLBACK');
        throw error;
      }

    } catch (error) {
      console.error('Error storing registration:', error);
      throw error;
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

      // Update registrations table
      const updateRegStmt = this.db.prepare(`
        UPDATE registrations 
        SET admin_password_hash = ?, updated_at = ?
        WHERE admin_email = ?
      `);

      updateRegStmt.run(
        newPasswordHash,
        new Date().toISOString(),
        email
      );

      // Update registration_credentials table (admin_password_hash reference)
      const updateCredStmt = this.db.prepare(`
        UPDATE registration_credentials 
        SET admin_password_hash = ?, last_reset_date = ?, reset_count = reset_count + 1
        WHERE admin_email = ?
      `);

      updateCredStmt.run(
        newPasswordHash,
        new Date().toISOString(),
        email
      );

      // Update users table if the user exists there
      const updateUserStmt = this.db.prepare(`
        UPDATE users 
        SET password_hash = ?
        WHERE email = ?
      `);

      updateUserStmt.run(newPasswordHash, email);

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
   * Create admin user account after registration
   */
  async createAdminUser(registrationId, email, password, fullName) {
    try {
      const passwordHash = await this.hashPassword(password);
      
      const stmt = this.db.prepare(`
        INSERT INTO users (
          registration_id,
          username,
          email,
          password_hash,
          full_name,
          role
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);

      const username = email.split('@')[0];
      
      stmt.run(
        registrationId,
        username,
        email,
        passwordHash,
        fullName,
        'admin'
      );

      console.log('Admin user created successfully');
    } catch (error) {
      console.error('Error creating admin user:', error);
      throw error;
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
          company_name,
          company_address,
          company_phone,
          company_email,
          admin_name,
          admin_email,
          license_key,
          is_registered,
          registered_at,
          created_at
        FROM registrations 
        WHERE is_registered = 1
        ORDER BY registered_at DESC
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
      // First check in registrations table
      const regStmt = this.db.prepare(`
        SELECT 
          admin_password_hash,
          admin_name,
          company_name
        FROM registrations 
        WHERE admin_email = ? AND is_registered = 1
      `);
      
      const registration = regStmt.get(email);
      
      if (registration) {
        // Verify against registration password
        const isValid = await this.verifyPassword(
          password,
          registration.admin_password_hash
        );
        
        if (isValid) {
          return {
            success: true,
            user: {
              email: email,
              name: registration.admin_name,
              role: 'admin',
              company: registration.company_name
            },
            source: 'registration'
          };
        }
      }

      // If not found in registrations, check in users table
      const userStmt = this.db.prepare(`
        SELECT 
          password_hash,
          full_name,
          role
        FROM users 
        WHERE email = ? AND is_active = 1
      `);
      
      const user = userStmt.get(email);
      
      if (user) {
        const isValid = await this.verifyPassword(
          password,
          user.password_hash
        );
        
        if (isValid) {
          return {
            success: true,
            user: {
              email: email,
              name: user.full_name,
              role: user.role
            },
            source: 'users'
          };
        }
      }

      return {
        success: false,
        error: 'Invalid email or password'
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
      console.log('Database connection closed');
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
      this.db.exec('DELETE FROM registrations');
      this.db.exec('DELETE FROM registration_credentials');
      this.db.exec('DELETE FROM users');
      this.db.exec('VACUUM'); // Clean up database file
      
      console.log('Registration data reset successfully');
      
      return {
        success: true,
        message: 'Registration reset complete'
      };
    } catch (error) {
      console.error('Error resetting registration:', error);
      throw error;
    }
  }

  /**
   * Get all users
   */
  getAllUsers() {
    try {
      const stmt = this.db.prepare(`
        SELECT id, username, email, full_name, role, is_active, last_login, created_at
        FROM users
        ORDER BY created_at DESC
      `);
      return stmt.all();
    } catch (error) {
      console.error('Error getting all users:', error);
      return [];
    }
  }

  /**
   * Update user
   */
  async updateUser(userId, userData) {
    try {
      let passwordUpdate = '';
      let params = [];
      
      if (userData.password) {
        // Hash the new password
        const passwordHash = await this.hashPassword(userData.password);
        passwordUpdate = 'password_hash = ?, ';
        params.push(passwordHash);
      }
      
      const stmt = this.db.prepare(`
        UPDATE users 
        SET ${passwordUpdate}
            full_name = ?,
            role = ?,
            is_active = ?
        WHERE id = ?
      `);
      
      params.push(
        userData.full_name,
        userData.role,
        userData.is_active ? 1 : 0,
        userId
      );
      
      const result = stmt.run(...params);
      
      return {
        success: true,
        rowsAffected: result.changes
      };
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  }

  /**
   * Change password
   */
  async changePassword(userId, currentPassword, newPassword) {
    try {
      // First get the current password hash
      const stmt = this.db.prepare(`
        SELECT password_hash FROM users WHERE id = ?
      `);
      
      const user = stmt.get(userId);
      
      if (!user) {
        return { success: false, error: 'User not found' };
      }
      
      // Verify current password
      const isValid = await this.verifyPassword(currentPassword, user.password_hash);
      
      if (!isValid) {
        return { success: false, error: 'Current password is incorrect' };
      }
      
      // Hash the new password
      const newPasswordHash = await this.hashPassword(newPassword);
      
      // Update password
      const updateStmt = this.db.prepare(`
        UPDATE users SET password_hash = ? WHERE id = ?
      `);
      
      updateStmt.run(newPasswordHash, userId);
      
      return {
        success: true,
        message: 'Password changed successfully'
      };
    } catch (error) {
      console.error('Error changing password:', error);
      return { success: false, error: 'Failed to change password' };
    }
  }
}

export default AuthService;