/**
 * VoicEV91 — Google Apps Script (FREE Gmail mail)
 *
 * Setup:
 * 1. Go to https://script.google.com → New project
 * 2. Delete default code, paste THIS whole file
 * 3. At top of file: paste service_role key into VOICEV91_SERVICE_ROLE_KEY → Save → Run configureSupabaseOnce()
 * 4. Run once: installDailyCompletionReminderTrigger() — daily reminder for unpaid-complete tickets
 * 5. Deploy → New deployment → Type: Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 6. IMPORTANT: copy the NEW Web app URL after each deploy
 * 7. In VoicEV91 Admin → Email alerts → paste URL → Save
 *
 * Duplicate sends for the same dedupe_key are skipped for 10 minutes (after a real send).
 *
 * Completion reminder (Step 4):
 * - Finds tickets in status "paid" where the full invoice is settled but user did not click Process Complete.
 * - Sends after N days (default 3) from paid_at — configured in Admin → Email alerts.
 * - Repeats once per day per ticket until completed. Logged in mail_logs as completion_reminder.
 */

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return json_({ ok: false, error: 'Empty body' });
    }

    var data = JSON.parse(e.postData.contents);
    var toList = (data.to || []).filter(function (x) {
      return typeof x === 'string' && x.indexOf('@') > 0;
    });

    if (!toList.length) {
      return json_({ ok: false, error: 'No recipients' });
    }

    var dedupe = String(data.dedupe_key || '');
    if (!dedupe) {
      dedupe = String(data.ticket_code || '') + ':' + String(data.event || '');
    }

    var cache = CacheService.getScriptCache();
    if (dedupe && cache.get('sent:' + dedupe)) {
      return json_({ ok: true, duplicate: true, skipped: true });
    }

    var subject = data.subject || 'VoicEV91 notification';
    var body = data.text || data.body || '';
    var html = data.html || '<pre>' + body + '</pre>';

    MailApp.sendEmail({
      to: toList.join(','),
      subject: subject,
      body: body,
      htmlBody: html,
      name: data.fromName || 'VoicEV91 Finance',
    });

    // Cache ONLY after a successful send (so a failed attempt can retry)
    if (dedupe) {
      cache.put('sent:' + dedupe, '1', 600);
    }

    return json_({
      ok: true,
      sent: toList.length,
      to: toList,
      dedupe_key: data.dedupe_key || null,
    });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  var params = e && e.parameter ? e.parameter : {};
  if (params.action === 'completion_reminders') {
    var secret = String(params.secret || '');
    var expected = PropertiesService.getScriptProperties().getProperty('CRON_SECRET') || '';
    if (!expected || secret !== expected) {
      return json_({ ok: false, error: 'Unauthorized' });
    }
    var result = runCompletionReminders();
    return json_(result);
  }
  return json_({ ok: true, service: 'VoicEV91 mail webhook' });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

// ---------- Project config (edit SERVICE_ROLE_KEY only) ----------
var VOICEV91_SUPABASE_URL = 'https://xnjnuonhymjblynoxmgw.supabase.co';
var VOICEV91_APP_URL = 'https://finance-team-invoice.vercel.app';
/** Paste Supabase service_role SECRET key here. See wrongKeyHelp_() if unsure. */
var VOICEV91_SERVICE_ROLE_KEY = '';

function wrongKeyHelp_() {
  return (
    'WRONG KEY: You pasted the publishable/anon key (same as VITE_SUPABASE_ANON_KEY in .env).\n' +
    'The daily completion reminder needs the SECRET service_role key.\n\n' +
    'How to get the CORRECT key:\n' +
    '1. Open: https://supabase.com/dashboard/project/xnjnuonhymjblynoxmgw/settings/api\n' +
    '2. Scroll to "Project API keys"\n' +
    '3. Find the row labeled service_role (secret) — NOT anon / publishable\n' +
    '4. Click Reveal / Copy\n' +
    '5. Paste into VOICEV91_SERVICE_ROLE_KEY at the top of Code.gs\n' +
    '6. Save → Run configureSupabaseOnce again\n\n' +
    'Correct key usually starts with: eyJ... (JWT) or sb_secret_...\n' +
    'Wrong key starts with: sb_publishable_... (do not use this)'
  );
}

function isPublishableOrAnonKey_(key) {
  if (!key) return false;
  var k = String(key).toLowerCase();
  return (
    k.indexOf('publishable') >= 0 ||
    k.indexOf('anon') >= 0 ||
    k.indexOf('sb_publishable_') === 0
  );
}

function resolveServiceRoleKey_() {
  var fromFile = String(VOICEV91_SERVICE_ROLE_KEY || '').trim();
  if (fromFile) return fromFile;
  return String(PropertiesService.getScriptProperties().getProperty('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
}

// ---------- Supabase secrets (run configureSupabaseOnce once) ----------

/**
 * Run → configureSupabaseOnce (one time).
 * 1. Paste your service_role key into VOICEV91_SERVICE_ROLE_KEY above (line ~99).
 * 2. Click Run on configureSupabaseOnce.
 */
function configureSupabaseOnce() {
  var url = String(VOICEV91_SUPABASE_URL || '').trim().replace(/\/$/, '');
  var key = resolveServiceRoleKey_();
  var appUrl = String(VOICEV91_APP_URL || 'https://finance-team-invoice.vercel.app').trim();

  if (!url || url.indexOf('supabase.co') < 0) {
    throw new Error('VOICEV91_SUPABASE_URL is missing or invalid at the top of this file.');
  }
  if (!key) {
    throw new Error(
      'No service_role key found.\n\n' +
        'Paste the SECRET key into VOICEV91_SERVICE_ROLE_KEY (top of file), Save, then Run again.\n\n' +
        wrongKeyHelp_(),
    );
  }
  if (isPublishableOrAnonKey_(key)) {
    throw new Error(wrongKeyHelp_());
  }

  var props = PropertiesService.getScriptProperties();
  props.setProperty('SUPABASE_URL', url);
  props.setProperty('SUPABASE_SERVICE_ROLE_KEY', key);
  props.setProperty('APP_URL', appUrl);
  if (!props.getProperty('CRON_SECRET')) {
    props.setProperty('CRON_SECRET', Utilities.getUuid());
  }
  Logger.log('Supabase secrets saved for ' + url);
  Logger.log('Service role key length: ' + key.length + ' chars (looks valid)');
  Logger.log('Next: run installDailyCompletionReminderTrigger(), then testCompletionReminders()');
  return { ok: true, url: url, appUrl: appUrl };
}

/** Run this if configureSupabaseOnce fails — prints help in the Execution log. */
function showWhichSupabaseKeyToUse() {
  Logger.log(wrongKeyHelp_());
  return wrongKeyHelp_();
}

/** Check saved config without exposing the full key. */
function showSupabaseConfigStatus() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('SUPABASE_URL') || '';
  var key = props.getProperty('SUPABASE_SERVICE_ROLE_KEY') || '';
  var appUrl = props.getProperty('APP_URL') || '';
  var status = {
    ok: !!(url && key),
    supabase_url: url || '(not set)',
    app_url: appUrl || '(not set)',
    service_role_key: key ? 'set (' + key.length + ' chars)' : '(not set — paste in VOICEV91_SERVICE_ROLE_KEY and run configureSupabaseOnce)',
  };
  Logger.log(JSON.stringify(status, null, 2));
  return status;
}

// ---------- Daily completion reminder ----------

function installDailyCompletionReminderTrigger() {
  removeDailyCompletionReminderTrigger();
  ScriptApp.newTrigger('runCompletionReminders')
    .timeBased()
    .everyDays(1)
    .atHour(9)
    .create();
  Logger.log('Daily completion reminder trigger installed (around 9:00 AM).');
}

function removeDailyCompletionReminderTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'runCompletionReminders') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}

/** Run manually from Apps Script editor to test without waiting for the daily trigger. */
function testCompletionReminders() {
  var result = runCompletionReminders();
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function runCompletionReminders() {
  var cfg = getSupabaseConfig_();
  if (!cfg.ok) return cfg;

  var settingsRows = supabaseGet_(
    cfg,
    'notification_settings?select=admin_emails,from_name,completion_reminder_days,completion_reminder_enabled&id=eq.1',
  );
  var settings = settingsRows && settingsRows[0] ? settingsRows[0] : {};
  if (settings.completion_reminder_enabled === false) {
    return { ok: true, skipped: true, reason: 'completion_reminder_enabled is false' };
  }

  var days = parseInt(settings.completion_reminder_days, 10);
  if (!days || days < 1) days = 3;

  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  var cutoffIso = cutoff.toISOString();

  var path =
    'tickets?status=eq.paid&paid_at=not.is.null&paid_at=lte.' +
    encodeURIComponent(cutoffIso) +
    '&select=id,ticket_code,subject,purpose,amount,paid_amount,paid_at,paid_by_name,status,user_id,profiles!user_id(email,full_name)';

  var tickets = supabaseGet_(cfg, path) || [];
  var appUrl = cfg.appUrl;
  var fromName = settings.from_name || 'VoicEV91 Finance';
  var adminEmails = splitEmails_(settings.admin_emails);
  var todayKey = todayKey_();
  var sent = 0;
  var skipped = 0;
  var errors = [];

  for (var i = 0; i < tickets.length; i++) {
    var ticket = tickets[i];
    if (!isInvoiceFullyPaid_(ticket)) {
      skipped++;
      continue;
    }

    var code = String(ticket.ticket_code || '').trim().toUpperCase();
    if (!code) {
      skipped++;
      continue;
    }

    var dedupeKey = code + ':completion_reminder:' + todayKey;
    if (mailLogAlreadySent_(cfg, dedupeKey)) {
      skipped++;
      continue;
    }

    var profile = ticket.profiles || {};
    var userEmail = String(profile.email || '').trim().toLowerCase();
    if (!userEmail) {
      skipped++;
      continue;
    }

    var daysWaiting = daysSince_(ticket.paid_at);
    var mail = buildCompletionReminderMail_(ticket, profile, daysWaiting, appUrl);
    var recipients = uniqueEmails_([userEmail].concat(adminEmails));
    if (!recipients.length) {
      skipped++;
      continue;
    }

    try {
      MailApp.sendEmail({
        to: recipients.join(','),
        subject: mail.subject,
        body: mail.text,
        htmlBody: mail.html,
        name: fromName,
      });

      logMail_(cfg, {
        event_type: 'completion_reminder',
        ticket_code: code,
        recipients: recipients.join(', '),
        subject: mail.subject,
        status: 'sent',
        dedupe_key: dedupeKey,
        recipient_count: recipients.length,
      });
      sent++;
    } catch (err) {
      var errMsg = String(err).slice(0, 500);
      logMail_(cfg, {
        event_type: 'completion_reminder',
        ticket_code: code,
        recipients: recipients.join(', '),
        subject: mail.subject,
        status: 'failed',
        error_message: errMsg,
        dedupe_key: dedupeKey,
        recipient_count: recipients.length,
      });
      errors.push({ ticket: code, error: errMsg });
    }
  }

  return {
    ok: true,
    scanned: tickets.length,
    sent: sent,
    skipped: skipped,
    errors: errors,
    cutoff: cutoffIso,
    reminder_days: days,
  };
}

function isInvoiceFullyPaid_(ticket) {
  var total = Number(ticket.amount || 0);
  var paid = Number(ticket.paid_amount || 0);
  return total > 0 && paid >= total - 0.001;
}

function daysSince_(iso) {
  if (!iso) return 0;
  var then = new Date(iso).getTime();
  if (isNaN(then)) return 0;
  return Math.floor((Date.now() - then) / (24 * 60 * 60 * 1000));
}

function todayKey_() {
  var d = new Date();
  return (
    d.getFullYear() +
    '-' +
    ('0' + (d.getMonth() + 1)).slice(-2) +
    '-' +
    ('0' + d.getDate()).slice(-2)
  );
}

function splitEmails_(value) {
  if (!value) return [];
  return String(value)
    .split(/[,;\s]+/)
    .map(function (e) {
      return e.trim().toLowerCase();
    })
    .filter(function (e) {
      return e.indexOf('@') > 0;
    });
}

function uniqueEmails_(list) {
  var seen = {};
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var e = list[i];
    if (!e || seen[e]) continue;
    seen[e] = true;
    out.push(e);
  }
  return out;
}

function buildCompletionReminderMail_(ticket, profile, daysWaiting, appUrl) {
  var brand = 'VoicEV91 Finance Invoice';
  var code = ticket.ticket_code || 'N/A';
  var user = profile.full_name || profile.email || 'User';
  var amount = Number(ticket.amount || 0);
  var paid = Number(ticket.paid_amount || 0);
  var paidOn = ticket.paid_at ? formatDateTime_(ticket.paid_at) : '—';
  var subject = '[' + brand + '] Reminder — complete ticket ' + code;
  var headline = 'Reminder: mark ticket as Process Complete';
  var intro =
    'Ticket ' +
    code +
    ' has been fully paid for ' +
    daysWaiting +
    ' day(s) but is still open. Please log in and click Process Complete.';

  var text =
    headline +
    '\n\n' +
    intro +
    '\n\nTicket: ' +
    code +
    '\nUser: ' +
    user +
    '\nInvoice: ₹' +
    amount.toFixed(2) +
    '\nPaid: ₹' +
    paid.toFixed(2) +
    '\nPaid on: ' +
    paidOn +
    '\nStatus: Paid — Awaiting Complete\n\nOpen app: ' +
    appUrl;

  var html =
    '<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#f0f7f2;font-family:Segoe UI,Arial,sans-serif;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #d4ead9;">' +
    '<tr><td style="padding:20px 24px;background:linear-gradient(135deg,#b45309,#d97706);color:#fff;">' +
    '<div style="font-size:12px;opacity:0.9;">' +
    brand +
    '</div><div style="font-size:20px;font-weight:700;margin-top:4px;">' +
    headline +
    '</div></td></tr>' +
    '<tr><td style="padding:20px 24px;color:#154028;font-size:15px;line-height:1.5;">' +
    '<p style="margin:0 0 16px;">' +
    intro +
    '</p>' +
    '<table role="presentation" width="100%" style="border-collapse:collapse;font-size:14px;">' +
    row_('Ticket', '<strong>' + esc_(code) + '</strong>') +
    row_('User', esc_(user)) +
    row_('Invoice amount', '<strong style="color:#15803d;">₹' + amount.toFixed(2) + '</strong>') +
    row_('Paid on', esc_(paidOn)) +
    row_('Status', '<span style="background:#fef3c7;color:#b45309;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:700;">Paid — Awaiting Complete</span>') +
    '</table>' +
    '<p style="margin:20px 0 0;"><a href="' +
    esc_(appUrl) +
    '" style="display:inline-block;background:#15803d;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;">Open app &amp; complete ticket</a></p>' +
    '</td></tr></table></body></html>';

  return { subject: subject, text: text, html: html };
}

function row_(label, valueHtml) {
  return (
    '<tr><td style="padding:10px 0;border-bottom:1px solid #e4f0e8;">' +
    '<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#2f6b45;">' +
    esc_(label) +
    '</div><div style="margin-top:2px;">' +
    valueHtml +
    '</div></td></tr>'
  );
}

function esc_(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDateTime_(iso) {
  try {
    return Utilities.formatDate(new Date(iso), Session.getScriptTimeZone(), 'dd MMM yyyy, HH:mm');
  } catch (e) {
    return String(iso);
  }
}

function getSupabaseConfig_() {
  var props = PropertiesService.getScriptProperties();
  var url = String(props.getProperty('SUPABASE_URL') || '').trim().replace(/\/$/, '');
  var key = String(props.getProperty('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
  var appUrl = String(props.getProperty('APP_URL') || 'https://finance-team-invoice.vercel.app').trim();
  if (!url || !key) {
    return {
      ok: false,
      error: 'Run configureSupabaseOnce() first (Supabase URL + service_role key).',
    };
  }
  return { ok: true, url: url, key: key, appUrl: appUrl };
}

function supabaseGet_(cfg, path) {
  var res = UrlFetchApp.fetch(cfg.url + '/rest/v1/' + path, {
    method: 'get',
    muteHttpExceptions: true,
    headers: {
      apikey: cfg.key,
      Authorization: 'Bearer ' + cfg.key,
      'Content-Type': 'application/json',
    },
  });
  var code = res.getResponseCode();
  var body = res.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('Supabase GET ' + path + ' failed (' + code + '): ' + body.slice(0, 300));
  }
  return JSON.parse(body);
}

function mailLogAlreadySent_(cfg, dedupeKey) {
  var rows = supabaseGet_(
    cfg,
    'mail_logs?select=status&dedupe_key=eq.' + encodeURIComponent(dedupeKey) + '&status=eq.sent&limit=1',
  );
  return rows && rows.length > 0;
}

function logMail_(cfg, row) {
  UrlFetchApp.fetch(cfg.url + '/rest/v1/mail_logs', {
    method: 'post',
    muteHttpExceptions: true,
    headers: {
      apikey: cfg.key,
      Authorization: 'Bearer ' + cfg.key,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    payload: JSON.stringify({
      event_type: row.event_type,
      ticket_code: row.ticket_code,
      recipients: row.recipients,
      subject: row.subject,
      status: row.status,
      error_message: row.error_message || null,
      dedupe_key: row.dedupe_key,
      recipient_count: row.recipient_count || 0,
    }),
  });
}
