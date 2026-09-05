/**
 * Settings — profile, credentials, company details and the local backup.
 *
 * Three of the original eight tabs (Notifications, Billing, Admin) rendered
 * nothing but a "Coming soon…" line, and several controls stood in for storage
 * that does not exist: a Light/Dark picker for a build that ships one palette,
 * a two-factor toggle nothing enforces, a session-timeout select the fixed
 * one-hour policy in `App.jsx` ignores, an invented list of "active sessions",
 * and a payroll-cutoff pair the payroll code hard-codes. Those are gone. What
 * is left either writes a column that exists or states a fact the app honours.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Building2,
  Camera,
  CheckCircle,
  Clock,
  Database,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Languages,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Palette,
  Phone,
  Save,
  User
} from 'lucide-react';
import { formatUtcStoredDate } from '../utils/manila';

const TABS = [
  { value: 'profile', label: 'Profile', Icon: User },
  { value: 'security', label: 'Security', Icon: Lock },
  { value: 'preferences', label: 'Preferences', Icon: Palette },
  { value: 'company', label: 'Company', Icon: Building2 },
  { value: 'backup', label: 'Backup', Icon: Database }
];

/** The five the original offered. Kept because the column is written. */
const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'ja', label: 'Japanese' }
];

const THEMES = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' }
];

/** What the code really hard-codes, shown where the dead inputs used to be. */
const FIXED_CONFIG = [
  ['Currency', 'Philippine peso (₱)'],
  ['Time zone', 'Asia/Manila (UTC+8)'],
  ['Working days', '24 a month, 12 a cutoff'],
  ['Payroll cutoffs', '1st–10th and 11th–25th'],
  ['Deductions', 'SSS, PhilHealth, Pag-IBIG, TRAIN withholding']
];

const AVATAR_LIMIT_BYTES = 2 * 1024 * 1024;

const MIN_PASSWORD_LENGTH = 8;

/** `Carlo Dandan` → `CD`, for the avatar before a picture is uploaded. */
const initials = (name) => {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '—';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
};

const Settings = () => {
  const [activeTab, setActiveTab] = useState('profile');
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState(null);

  // The `registration_credentials` row, which is the whole of this app's
  // account storage: company details, admin identity and profile all live on it.
  const [registration, setRegistration] = useState(null);

  // The address every write is keyed on. It follows the database, not the email
  // field, so editing that field cannot point an avatar or password write at a
  // row that does not exist yet.
  const [accountEmail, setAccountEmail] = useState('');

  const [profile, setProfile] = useState({
    email: '',
    displayName: '',
    avatar: '',
    position: 'System Administrator',
    bio: ''
  });

  const [preferences, setPreferences] = useState({ theme: 'light', language: 'en' });

  const [company, setCompany] = useState({
    company_name: '',
    company_email: '',
    company_contact: '',
    company_address: ''
  });

  const [password, setPassword] = useState({ current: '', next: '', confirm: '' });
  const [revealPasswords, setRevealPasswords] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingCompany, setSavingCompany] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [backupPath, setBackupPath] = useState('');

  // One timer for the banner. The original left four `setTimeout`s running, so a
  // second save could clear the first message while the second was still up.
  const bannerTimer = useRef(null);

  const flash = (type, message) => {
    setBanner({ type, message });
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setBanner(null), type === 'error' ? 5000 : 3000);
  };

  useEffect(
    () => () => {
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
    },
    []
  );

  useEffect(() => {
    load();
  }, []);

  /**
   * Read the account row once, then the profile keyed on its admin address.
   *
   * The original ran two loads in parallel and read the profile with
   * `getUserSettings(email)`, which selects `theme_preference, language` alone —
   * and only for the address it is given, which started as the literal
   * `adminpro@company.com`. Every one of the eight camelCase fields it then read
   * off that row was `undefined`, so the avatar and the bio never came back from
   * the database at all. `getUserProfile` is the query that returns them.
   */
  const load = async () => {
    setLoading(true);
    try {
      const info = await window.api.getRegistrationInfo();
      const row = info?.success ? info.data : null;

      if (row) {
        setRegistration(row);
        setCompany({
          company_name: row.company_name || '',
          company_email: row.company_email || '',
          // The column is `company_contact`. The original read `company_phone`,
          // so the field was always blank on arrival.
          company_contact: row.company_contact || '',
          company_address: row.company_address || ''
        });
      }

      const email = row?.admin_email || '';
      setAccountEmail(email);

      const stored = await window.api.getUserProfile(email);
      setProfile({
        email: stored?.email || email,
        displayName: stored?.display_name || row?.admin_name || '',
        avatar: stored?.avatar || '',
        position: stored?.position || 'System Administrator',
        bio: stored?.bio || ''
      });
      setPreferences({
        theme: stored?.theme_preference || 'light',
        language: stored?.language || 'en'
      });
    } catch (error) {
      console.error('Error loading settings:', error);
      flash('error', 'Could not read your account details.');
    } finally {
      setLoading(false);
    }
  };

  /** Profile and preferences are one row, so one payload writes both tabs. */
  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      const result = await window.api.saveUserProfile({
        email: profile.email,
        displayName: profile.displayName,
        avatar: profile.avatar,
        bio: profile.bio,
        themePreference: preferences.theme,
        language: preferences.language
      });

      // `save_profile` answers `{ success: false }` when no registered admin
      // exists rather than throwing. The original ignored the result and always
      // looked like it had worked — in fact it showed nothing at all on success.
      if (result && result.success === false) {
        throw new Error(result.error || 'The account row could not be updated.');
      }

      setAccountEmail(profile.email);
      window.dispatchEvent(
        new CustomEvent('profileUpdated', {
          detail: {
            displayName: profile.displayName,
            avatar: profile.avatar,
            email: profile.email,
            position: profile.position
          }
        })
      );
      flash('success', 'Profile saved.');
    } catch (error) {
      console.error('Error saving settings:', error);
      flash('error', error.message || 'Could not save your profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const uploadAvatar = async (event) => {
    const file = event.target.files?.[0];
    // Clearing the input lets the same file be picked twice in a row, which the
    // original could not do: the change event never fired the second time.
    event.target.value = '';
    if (!file) return;

    if (file.size > AVATAR_LIMIT_BYTES) {
      flash('error', 'Pick an image under 2 MB.');
      return;
    }

    setUploadingAvatar(true);
    const reader = new FileReader();

    reader.onerror = () => {
      setUploadingAvatar(false);
      flash('error', 'That image could not be read.');
    };

    reader.onloadend = async () => {
      const dataUrl = reader.result;
      try {
        const result = await window.api.updateUserAvatar(accountEmail, dataUrl);
        // `update_avatar` matches on `admin_email`; a miss writes nothing and
        // reports `success: false` rather than failing.
        if (result && result.success === false) {
          throw new Error('No account row matched this address.');
        }

        setProfile((previous) => ({ ...previous, avatar: dataUrl }));
        window.dispatchEvent(
          new CustomEvent('avatarUpdated', { detail: { avatar: dataUrl } })
        );
        flash('success', 'Profile picture updated.');
      } catch (error) {
        console.error('Error saving avatar:', error);
        flash('error', error.message || 'Could not update the picture.');
      } finally {
        setUploadingAvatar(false);
      }
    };

    reader.readAsDataURL(file);
  };

  /**
   * "Update Password" had no `onClick` in the original — the three fields went
   * nowhere. `changePassword` verifies the current one against the stored hash
   * before writing, which is why it is asked for.
   */
  const changePassword = async (event) => {
    event.preventDefault();
    setPasswordError('');

    if (!password.current) {
      setPasswordError('Enter your current password.');
      return;
    }
    if (password.next.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(`The new password needs at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    if (password.next !== password.confirm) {
      setPasswordError('The two new passwords do not match.');
      return;
    }
    if (password.next === password.current) {
      setPasswordError('The new password matches the current one.');
      return;
    }

    setChangingPassword(true);
    try {
      const result = await window.api.changePassword(
        accountEmail,
        password.current,
        password.next
      );
      if (!result?.success) {
        setPasswordError(result?.error || 'The password could not be changed.');
        return;
      }

      setPassword({ current: '', next: '', confirm: '' });
      setRevealPasswords(false);
      flash('success', 'Password changed. Use it at the next sign-in.');
    } catch (error) {
      console.error('Error changing password:', error);
      setPasswordError('The password could not be changed.');
    } finally {
      setChangingPassword(false);
    }
  };

  /**
   * The four columns `registration_credentials` actually has.
   *
   * This wrote the whole form object to `localStorage` under a key nothing ever
   * read, then reported "Company information saved!" — so the details reverted
   * on the next visit. `updateCompanyInfo` was exposed all along and unused.
   */
  const saveCompany = async () => {
    setSavingCompany(true);
    try {
      const result = await window.api.updateCompanyInfo(company);
      if (!result?.success) {
        throw new Error(result?.error || 'The company row could not be updated.');
      }

      const info = await window.api.getRegistrationInfo();
      if (info?.success && info.data) setRegistration(info.data);
      flash('success', 'Company details saved.');
    } catch (error) {

      console.error('Error saving company info:', error);
      flash('error', error.message || 'Could not save the company details.');
    } finally {
      setSavingCompany(false);
    }
  };

  /** "Backup Data" was decoration; `backupDatabase` writes a real copy. */
  const runBackup = async () => {
    setBackingUp(true);
    try {
      const result = await window.api.backupDatabase();
      if (!result?.success) {
        throw new Error(result?.error || 'The copy could not be written.');
      }
      setBackupPath(result.path || '');
      flash('success', 'Backup written.');
    } catch (error) {
      console.error('Error backing up database:', error);
      flash('error', error.message || 'Could not write the backup.');
    } finally {
      setBackingUp(false);
    }
  };

  const setField = (setter) => (field) => (event) =>
    setter((previous) => ({ ...previous, [field]: event.target.value }));

  const onProfileField = setField(setProfile);
  const onCompanyField = setField(setCompany);
  const onPreferenceField = setField(setPreferences);

  const passwordType = revealPasswords ? 'text' : 'password';
  const passwordFieldProps = passwordError
    ? { 'aria-invalid': 'true', 'aria-describedby': 'password-error' }
    : {};

  return (
    <div className="page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle mt-1">
            Your account, credentials and company record.
          </p>
        </div>
        {registration?.company_name && (
          <span className="badge badge-muted">
            <Building2 size={13} aria-hidden="true" />
            {registration.company_name}
          </span>
        )}
      </div>

      {banner && (
        <div
          className={`alert ${banner.type === 'success' ? 'alert-success' : 'alert-danger'}`}
          role={banner.type === 'success' ? 'status' : 'alert'}
          aria-live={banner.type === 'success' ? 'polite' : 'assertive'}
        >
          {banner.type === 'success' ? (
            <CheckCircle size={16} aria-hidden="true" />
          ) : (
            <AlertCircle size={16} aria-hidden="true" />
          )}
          <span>{banner.message}</span>
        </div>
      )}

      <div
        className="flex flex-wrap gap-1 border-b border-[rgb(248_250_252/0.1)]"
        role="tablist"
        aria-label="Settings sections"
      >
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            id={`settings-tab-${tab.value}`}
            aria-selected={activeTab === tab.value}
            aria-controls="settings-panel"
            onClick={() => setActiveTab(tab.value)}
            className={`tab ${activeTab === tab.value ? 'tab-active' : ''}`}
          >
            <tab.Icon size={15} aria-hidden="true" />
            {tab.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id="settings-panel"
        aria-labelledby={`settings-tab-${activeTab}`}
        tabIndex={-1}
        className="flex flex-col gap-3"
      >
        {loading ? (
          <div
            className="card flex items-center justify-center py-16"
            role="status"
            aria-live="polite"
          >
            <span className="spinner spinner-lg text-accent" aria-hidden="true" />
            <span className="sr-only">Loading your settings…</span>
          </div>
        ) : (
          <>
            {activeTab === 'profile' && (
              <section className="card p-5" aria-labelledby="profile-heading">
                <h2 id="profile-heading" className="section-title">
                  Profile
                </h2>
                <p className="page-subtitle mt-0.5">
                  The name and picture the header shows.
                </p>

                <div className="mt-5 flex flex-wrap items-center gap-4">
                  {/* Decorative: the name sits next to it. */}
                  <span className="avatar h-20 w-20 text-2xl">
                    {profile.avatar ? <img src={profile.avatar} alt="" /> : initials(profile.displayName)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate-1 text-base font-semibold">
                      {profile.displayName || 'Unnamed admin'}
                    </p>
                    <p className="text-sm text-muted-foreground">{profile.position}</p>
                    {/* A label is not focusable, so the focus ring comes from the
                        input inside it. */}
                    <label className="btn btn-outline btn-sm mt-2 cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-white">
                      {uploadingAvatar ? (
                        <Loader2 size={15} className="animate-spin" aria-hidden="true" />
                      ) : (
                        <Camera size={15} aria-hidden="true" />
                      )}
                      {uploadingAvatar ? 'Uploading…' : 'Change picture'}
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={uploadAvatar}
                        disabled={uploadingAvatar}
                      />
                    </label>
                    <p className="help-text">PNG or JPEG under 2 MB.</p>
                  </div>
                </div>

                <hr className="divider my-5" />

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label htmlFor="display-name" className="label">
                      Display name
                    </label>
                    <input
                      id="display-name"
                      type="text"
                      value={profile.displayName}
                      onChange={onProfileField('displayName')}
                      className="input"
                      autoComplete="name"
                    />
                  </div>

                  <div>
                    <label htmlFor="account-email" className="label">
                      Email address
                    </label>
                    <div className="input-group">
                      <Mail size={16} className="input-icon" aria-hidden="true" />
                      <input
                        id="account-email"
                        type="email"
                        value={profile.email}
                        onChange={onProfileField('email')}
                        className="input"
                        autoComplete="email"
                        aria-describedby="account-email-help"
                      />
                    </div>
                    <p id="account-email-help" className="help-text">
                      Also the address you sign in with.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="account-position" className="label">
                      Position
                    </label>
                    <input
                      id="account-position"
                      type="text"
                      value={profile.position}
                      className="input"
                      readOnly
                      aria-describedby="account-position-help"
                    />
                    {/* The query returns this as a literal; there is no column
                        behind it, so an editable box would discard what you type. */}
                    <p id="account-position-help" className="help-text">
                      Fixed for the single-admin build.
                    </p>
                  </div>

                  <div className="md:col-span-2">
                    <label htmlFor="account-bio" className="label">
                      Bio
                    </label>
                    <textarea
                      id="account-bio"
                      value={profile.bio}
                      onChange={onProfileField('bio')}
                      rows={3}
                      className="textarea"
                      placeholder="A line about this account."
                    />
                  </div>
                </div>

                {/* The original's single Save button sat in the sidebar and
                    changed meaning with the tab, so on Security or Backup it
                    silently saved the profile instead. Each panel owns its own. */}
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <p className="help-text">
                    Phone number was dropped: no column stores it.
                  </p>
                  <button
                    type="button"
                    onClick={saveProfile}
                    disabled={savingProfile}
                    className="btn btn-primary"
                  >
                    {savingProfile ? (
                      <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                    ) : (
                      <Save size={16} aria-hidden="true" />
                    )}
                    {savingProfile ? 'Saving…' : 'Save profile'}
                  </button>
                </div>
              </section>
            )}

            {activeTab === 'security' && (
              <>
                <section className="card p-5" aria-labelledby="password-heading">
                  <h2 id="password-heading" className="section-title flex items-center gap-2">
                    <KeyRound size={17} className="text-accent" aria-hidden="true" />
                    Change password
                  </h2>
                  <p className="page-subtitle mt-0.5">
                    The current password is checked against the stored hash before
                    the new one is written.
                  </p>

                  <form onSubmit={changePassword} className="mt-5">
                    <div className="flex flex-col gap-4">
                      <div className="md:max-w-sm">
                        <label htmlFor="current-password" className="label label-required">
                          Current password
                        </label>
                        <input
                          id="current-password"
                          type={passwordType}
                          value={password.current}
                          onChange={(event) =>
                            setPassword((previous) => ({ ...previous, current: event.target.value }))
                          }
                          className={`input ${passwordError ? 'input-invalid' : ''}`}
                          autoComplete="current-password"
                          {...passwordFieldProps}
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                          <label htmlFor="new-password" className="label label-required">
                            New password
                          </label>
                          <input
                            id="new-password"
                            type={passwordType}
                            value={password.next}
                            onChange={(event) =>
                              setPassword((previous) => ({ ...previous, next: event.target.value }))
                            }
                            className={`input ${passwordError ? 'input-invalid' : ''}`}
                            autoComplete="new-password"
                            aria-describedby={passwordError ? 'password-error' : 'new-password-help'}
                            aria-invalid={passwordError ? 'true' : undefined}
                          />
                          <p id="new-password-help" className="help-text">
                            At least {MIN_PASSWORD_LENGTH} characters, matching sign-up.
                          </p>
                        </div>

                        <div>
                          <label htmlFor="confirm-password" className="label label-required">
                            Confirm new password
                          </label>
                          <input
                            id="confirm-password"
                            type={passwordType}
                            value={password.confirm}
                            onChange={(event) =>
                              setPassword((previous) => ({
                                ...previous,
                                confirm: event.target.value
                              }))
                            }
                            className={`input ${passwordError ? 'input-invalid' : ''}`}
                            autoComplete="new-password"
                            {...passwordFieldProps}
                          />
                        </div>
                      </div>
                    </div>
                    {passwordError && (
                      <p id="password-error" className="error-text mt-3" role="alert">
                        <AlertCircle size={13} aria-hidden="true" />
                        {passwordError}
                      </p>
                    )}

                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                      {/* A checkbox rather than an icon button: it reads its own
                          state out, where a toggling eye needs `aria-pressed`
                          and still leaves sighted users guessing which way it
                          points. One control covers all three fields. */}
                      <label htmlFor="reveal-passwords" className="flex items-center gap-2 text-sm">
                        <input
                          id="reveal-passwords"
                          type="checkbox"
                          checked={revealPasswords}
                          onChange={(event) => setRevealPasswords(event.target.checked)}
                          className="checkbox"
                        />
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          {revealPasswords ? (
                            <EyeOff size={14} aria-hidden="true" />
                          ) : (
                            <Eye size={14} aria-hidden="true" />
                          )}
                          Show passwords
                        </span>
                      </label>

                      <button type="submit" disabled={changingPassword} className="btn btn-primary">
                        {changingPassword ? (
                          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                        ) : (
                          <KeyRound size={16} aria-hidden="true" />
                        )}
                        {changingPassword ? 'Updating…' : 'Update password'}
                      </button>
                    </div>
                  </form>
                </section>
                <section className="card p-5" aria-labelledby="account-heading">
                  <h2 id="account-heading" className="section-title">
                    Account
                  </h2>
                  <p className="page-subtitle mt-0.5">
                    This build runs a single administrator account.
                  </p>

                  <dl className="mt-4">
                    <div className="field-row">
                      <dt className="field-key">Sign-in address</dt>
                      <dd className="field-value wrap-anywhere">{accountEmail || '—'}</dd>
                    </div>
                    <div className="field-row">
                      <dt className="field-key">Registered</dt>
                      <dd className="field-value">
                        {/* `registration_date` and `last_updated` are SQLite
                            `CURRENT_TIMESTAMP`, i.e. UTC, unlike the app's own
                            Manila wall-clock columns. The helper shifts them. */}
                        {formatUtcStoredDate(registration?.registration_date, {
                          dateStyle: 'medium',
                          timeStyle: 'short'
                        })}
                      </dd>
                    </div>
                    <div className="field-row">
                      <dt className="field-key">Last updated</dt>
                      <dd className="field-value">
                        {formatUtcStoredDate(registration?.last_updated, {
                          dateStyle: 'medium',
                          timeStyle: 'short'
                        })}
                      </dd>
                    </div>
                  </dl>

                  {/* The original offered a session-timeout select and a
                      two-factor switch. Neither had storage, and the real policy
                      is fixed in `App.jsx`, so it is stated instead of faked. */}
                  <p className="help-text mt-4">
                    <Clock size={13} aria-hidden="true" />
                    Signed out after one hour of a session, and always when the app
                    starts again.
                  </p>
                </section>
              </>
            )}
            {activeTab === 'preferences' && (
              <section className="card p-5" aria-labelledby="preferences-heading">
                <h2 id="preferences-heading" className="section-title">
                  Preferences
                </h2>
                <p className="page-subtitle mt-0.5">
                  Saved on the same record as the profile.
                </p>

                <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label htmlFor="theme-preference" className="label">
                      Theme
                    </label>
                    <div className="input-group">
                      <Palette size={15} className="input-icon" aria-hidden="true" />
                      <select
                        id="theme-preference"
                        value={preferences.theme}
                        onChange={onPreferenceField('theme')}
                        className="select"
                      >
                        {THEMES.map((theme) => (
                          <option key={theme.value} value={theme.value}>
                            {theme.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="language-preference" className="label">
                      Language
                    </label>
                    <div className="input-group">
                      <Languages size={15} className="input-icon" aria-hidden="true" />
                      <select
                        id="language-preference"
                        value={preferences.language}
                        onChange={onPreferenceField('language')}
                        className="select"
                      >
                        {LANGUAGES.map((language) => (
                          <option key={language.value} value={language.value}>
                            {language.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                {/* Both columns exist and both are written; nothing reads them
                    back. The original also offered font size and compact mode,
                    which had no column at all, and a Light/Dark picker sold as
                    live. Saying so beats a control that quietly does nothing. */}
                <p className="help-text mt-4">
                  Stored with your profile. This build renders a single dark palette
                  and English copy, so these are recorded for later rather than
                  applied now.
                </p>

                <div className="mt-5 flex justify-end">
                  <button
                    type="button"
                    onClick={saveProfile}
                    disabled={savingProfile}
                    className="btn btn-primary"
                  >
                    {savingProfile ? (
                      <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                    ) : (
                      <Save size={16} aria-hidden="true" />
                    )}
                    {savingProfile ? 'Saving…' : 'Save preferences'}
                  </button>
                </div>
              </section>
            )}
            {activeTab === 'company' && (
              <>
                {!registration ? (
                  <div className="card empty-state">
                    <span className="empty-state-icon">
                      <Building2 size={22} aria-hidden="true" />
                    </span>
                    <h2 className="section-title">No registration record</h2>
                    <p className="page-subtitle mt-1">
                      The company details are stored with the registration, and this
                      database has none yet.
                    </p>
                  </div>
                ) : (
                  <section className="card p-5" aria-labelledby="company-heading">
                    <h2 id="company-heading" className="section-title">
                      Company details
                    </h2>
                    <p className="page-subtitle mt-0.5">
                      Printed on payslips and shown in the sidebar.
                    </p>

                    <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div>
                        <label htmlFor="company-name" className="label">
                          Company name
                        </label>
                        <div className="input-group">
                          <Building2 size={15} className="input-icon" aria-hidden="true" />
                          <input
                            id="company-name"
                            type="text"
                            value={company.company_name}
                            onChange={onCompanyField('company_name')}
                            className="input"
                            autoComplete="organization"
                          />
                        </div>
                      </div>

                      <div>
                        <label htmlFor="company-email" className="label">
                          Company email
                        </label>
                        <div className="input-group">
                          <Mail size={15} className="input-icon" aria-hidden="true" />
                          <input
                            id="company-email"
                            type="email"
                            value={company.company_email}
                            onChange={onCompanyField('company_email')}
                            className="input"
                          />
                        </div>
                      </div>
                      <div>
                        <label htmlFor="company-contact" className="label">
                          Contact number
                        </label>
                        <div className="input-group">
                          <Phone size={15} className="input-icon" aria-hidden="true" />
                          <input
                            id="company-contact"
                            type="tel"
                            value={company.company_contact}
                            onChange={onCompanyField('company_contact')}
                            className="input"
                            autoComplete="tel"
                            placeholder="+63 900 000 0000"
                          />
                        </div>
                      </div>

                      <div className="md:col-span-2">
                        {/* Not an `input-group`: `.input-icon` centres itself
                            vertically and only `.input`/`.select` pad to clear
                            it, so on a two-row textarea it lands on the text. */}
                        <label
                          htmlFor="company-address"
                          className="label flex items-center gap-1.5"
                        >
                          <MapPin size={13} aria-hidden="true" />
                          Address
                        </label>
                        <textarea
                          id="company-address"
                          value={company.company_address}
                          onChange={onCompanyField('company_address')}
                          rows={2}
                          className="textarea"
                        />
                      </div>
                    </div>

                    <div className="mt-5 flex justify-end">
                      <button
                        type="button"
                        onClick={saveCompany}
                        disabled={savingCompany}
                        className="btn btn-primary"
                      >
                        {savingCompany ? (
                          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                        ) : (
                          <Save size={16} aria-hidden="true" />
                        )}
                        {savingCompany ? 'Saving…' : 'Save company details'}
                      </button>
                    </div>
                  </section>
                )}
                {/* What used to be six editable fields — currency, time zone,
                    working days, working hours and the two cutoff days — none of
                    which had a column, and all of which payroll hard-codes. They
                    are listed as facts so nobody edits a value that cannot move. */}
                <section className="card p-5" aria-labelledby="fixed-heading">
                  <h2 id="fixed-heading" className="section-title">
                    Fixed configuration
                  </h2>
                  <p className="page-subtitle mt-0.5">
                    Built into the payroll rules, not stored as settings.
                  </p>

                  <dl className="mt-4">
                    {FIXED_CONFIG.map(([key, value]) => (
                      <div key={key} className="field-row">
                        <dt className="field-key">{key}</dt>
                        <dd className="field-value">{value}</dd>
                      </div>
                    ))}
                  </dl>

                  <p className="help-text mt-4">
                    Changing any of these means changing the payroll calculator.
                  </p>
                </section>
              </>
            )}
            {activeTab === 'backup' && (
              <section className="card p-5" aria-labelledby="backup-heading">
                <h2 id="backup-heading" className="section-title flex items-center gap-2">
                  <Database size={17} className="text-accent" aria-hidden="true" />
                  Database backup
                </h2>
                <p className="page-subtitle mt-0.5">
                  Copies the whole SQLite file — employees, attendance, payroll and
                  this account — beside the original, stamped with the time.
                </p>

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={runBackup}
                    disabled={backingUp}
                    className="btn btn-primary"
                  >
                    {backingUp ? (
                      <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                    ) : (
                      <Download size={16} aria-hidden="true" />
                    )}
                    {backingUp ? 'Copying…' : 'Create backup'}
                  </button>
                  <p className="help-text">Takes a moment on a large database.</p>
                </div>

                {backupPath && (
                  <div className="surface wrap-anywhere mt-4 p-3" role="status" aria-live="polite">
                    <p className="kpi-label">Saved to</p>
                    <p className="mt-1 font-mono text-sm">{backupPath}</p>
                  </div>
                )}

                {/* The original paired this with a "Restore" button that had no
                    handler and no command behind it. Restoring really is a file
                    copy, so it says how rather than pretending to do it. */}
                <p className="help-text mt-4">
                  To restore, close the app and copy a backup over the live database
                  file, keeping its original name.
                </p>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Settings;
