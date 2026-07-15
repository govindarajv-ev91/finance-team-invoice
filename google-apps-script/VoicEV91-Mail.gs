/**
 * VoicEV91 — Google Apps Script (FREE Gmail mail)
 *
 * Setup:
 * 1. Go to https://script.google.com → New project
 * 2. Delete default code, paste THIS whole file
 * 3. Deploy → New deployment → Type: Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4. IMPORTANT: copy the NEW Web app URL after each deploy
 * 5. In VoicEV91 Admin → Email alerts → paste URL → Save
 *
 * Duplicate sends for the same dedupe_key are skipped for 10 minutes (after a real send).
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

function doGet() {
  return json_({ ok: true, service: 'VoicEV91 mail webhook' });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
